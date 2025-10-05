import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const API_BASE_URL = 'http://127.0.0.1:8000';

interface AsteroidData {
    id: string;
    name: string;
    nasa_jpl_url: string;
    absolute_magnitude_h: number;
    estimated_diameter_km_min: number;
    estimated_diameter_km_max: number;
    estimated_diameter_m_min: number;
    estimated_diameter_m_max: number;
    estimated_diameter_mi_min: number;
    estimated_diameter_mi_max: number;
    estimated_diameter_ft_min: number;
    estimated_diameter_ft_max: number;
    is_potentially_hazardous_asteroid: boolean;
    is_sentry_object: boolean;
    close_approach_date: string;
    close_approach_date_full: string;
    epoch_date_close_approach: number;
    relative_velocity_km_s: number;
    relative_velocity_km_h: number;
    relative_velocity_mph: number;
    miss_distance_au: number;
    miss_distance_lunar: number;
    miss_distance_km: number;
    miss_distance_mi: number;
    orbiting_body: string;
    impact: {
        energy_megatons: number;
        crater_km: number;
        risk_zones: string[];
    };
    torino_scale: number;
    importance_score: number;
}

interface AsteroidMesh extends THREE.Mesh {
    userData: AsteroidData;
    originalScale?: number;
    originalColor?: number;
    originalEmissive?: number;
    originalEmissiveIntensity?: number;
    orbitRing?: number;
    orbitRadius?: number;
    orbitSpeed?: number;
    orbitAngle?: number;
    orbitCenter?: THREE.Vector3;
    hitboxMesh?: THREE.Mesh;
}

// Calculation helper functions
function calculateImpactEnergy(diameterKm: number, velocityKmS: number): number {
    const density = 2500;
    const radiusM = (diameterKm * 1000) / 2;
    const volumeM3 = (4 / 3) * Math.PI * radiusM ** 3;
    const massKg = volumeM3 * density;
    const velocityMS = velocityKmS * 1000;
    const energyJoules = 0.5 * massKg * velocityMS ** 2;
    const megatonsTNT = energyJoules / 4.184e15;
    return megatonsTNT;
}

function calculateTorinoScale(
    diameterKm: number,
    energyMegatons: number,
    isPHA: boolean,
    isSentry: boolean,
): number {
    if (isSentry) {
        if (energyMegatons > 1000000) return 10;
        if (energyMegatons > 100000) return 9;
        if (energyMegatons > 10000) return 8;
        if (energyMegatons > 1000) return 7;
        if (diameterKm > 1) return 4;
        return 3;
    }
    if (isPHA) {
        if (energyMegatons > 100000) return 3;
        if (diameterKm > 1) return 2;
        return 1;
    }
    return 0;
}

function calculateCraterSize(diameterKm: number, velocityKmS: number): number {
    const craterDiameterKm = diameterKm * 20 * (velocityKmS / 20) ** 0.33;
    return craterDiameterKm;
}

function generateRiskZones(energyMegatons: number, isPHA: boolean, isSentry: boolean): string[] {
    const zones: string[] = [];
    if (energyMegatons > 100000) {
        zones.push('Global Extinction Event', 'Mass Extinction Event', 'Global Devastation');
    } else if (energyMegatons > 10000) {
        zones.push('Continental Devastation', 'Global Impact', 'Multiple Continents');
    } else if (energyMegatons > 1000) {
        zones.push('Regional Damage', 'Pacific Ocean', 'Atlantic Ocean', 'Indian Ocean');
    } else if (energyMegatons > 100) {
        zones.push('Pacific Ocean', 'Coastal Japan', 'Western Pacific');
    } else if (energyMegatons > 10) {
        zones.push('Remote Ocean', 'Central Pacific', 'North Atlantic');
    } else {
        zones.push('Remote Ocean');
    }
    return zones;
}

function calculateImportanceScore(
    diameterKm: number,
    velocityKmS: number,
    missDistanceAU: number,
    isPHA: boolean,
    isSentry: boolean,
): number {
    let score = 0;
    if (diameterKm > 10) score += 4;
    else if (diameterKm > 1) score += 3;
    else if (diameterKm > 0.5) score += 2;
    else score += 1;
    if (velocityKmS > 25) score += 2;
    else if (velocityKmS > 15) score += 1;
    if (missDistanceAU < 0.05) score += 2;
    else if (missDistanceAU < 0.2) score += 1;
    if (isSentry) score += 3;
    else if (isPHA) score += 2;
    return Math.min(score, 10);
}

function createStarField() {
    const starsGeometry = new THREE.BufferGeometry();
    const starCount = 15000;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 4000;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 4000;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 4000;

        const starType = Math.random();
        if (starType < 0.7) {
            colors[i * 3] = 1;
            colors[i * 3 + 1] = 1;
            colors[i * 3 + 2] = 1;
        } else if (starType < 0.85) {
            colors[i * 3] = 0.7;
            colors[i * 3 + 1] = 0.8;
            colors[i * 3 + 2] = 1;
        } else if (starType < 0.95) {
            colors[i * 3] = 1;
            colors[i * 3 + 1] = 1;
            colors[i * 3 + 2] = 0.7;
        } else {
            colors[i * 3] = 1;
            colors[i * 3 + 1] = 0.7;
            colors[i * 3 + 2] = 0.7;
        }
    }

    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const starsMaterial = new THREE.PointsMaterial({
        size: 2,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
    });

    return new THREE.Points(starsGeometry, starsMaterial);
}

function createDetailedEarth() {
    const earthGeometry = new THREE.SphereGeometry(6, 128, 128);
    const earthCanvas = document.createElement('canvas');
    earthCanvas.width = 1024;
    earthCanvas.height = 512;
    const earthContext = earthCanvas.getContext('2d')!;

    const oceanGradient = earthContext.createLinearGradient(0, 0, 0, 512);
    oceanGradient.addColorStop(0, '#1a5490');
    oceanGradient.addColorStop(0.5, '#2563eb');
    oceanGradient.addColorStop(1, '#1a5490');
    earthContext.fillStyle = oceanGradient;
    earthContext.fillRect(0, 0, 1024, 512);

    for (let i = 0; i < 50; i++) {
        const x = Math.random() * 1024;
        const y = Math.random() * 512;
        const radius = Math.random() * 100 + 20;
        const opacity = Math.random() * 0.3;

        const gradient = earthContext.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(30, 100, 150, ${opacity})`);
        gradient.addColorStop(1, 'rgba(30, 100, 150, 0)');
        earthContext.fillStyle = gradient;
        earthContext.beginPath();
        earthContext.arc(x, y, radius, 0, Math.PI * 2);
        earthContext.fill();
    }

    const continentColors = ['#228b22', '#32cd32', '#90ee90', '#006400'];

    earthContext.fillStyle = continentColors[0];
    earthContext.fillRect(80, 60, 120, 90);
    earthContext.fillRect(60, 80, 80, 70);
    earthContext.fillRect(100, 140, 60, 40);

    earthContext.fillStyle = continentColors[1];
    earthContext.fillRect(140, 180, 60, 120);
    earthContext.fillRect(120, 220, 40, 100);

    earthContext.fillStyle = continentColors[2];
    earthContext.fillRect(400, 80, 80, 60);
    earthContext.fillRect(420, 70, 60, 40);

    earthContext.fillStyle = continentColors[0];
    earthContext.fillRect(420, 140, 100, 160);
    earthContext.fillRect(440, 160, 80, 120);

    earthContext.fillStyle = continentColors[3];
    earthContext.fillRect(500, 80, 200, 120);
    earthContext.fillRect(520, 120, 160, 80);
    earthContext.fillRect(600, 60, 100, 60);

    earthContext.fillStyle = continentColors[1];
    earthContext.fillRect(700, 240, 80, 40);

    earthContext.fillStyle = '#8b4513';
    for (let i = 0; i < 30; i++) {
        const x = Math.random() * 1024;
        const y = Math.random() * 512;
        earthContext.fillRect(x, y, Math.random() * 20 + 5, Math.random() * 10 + 2);
    }

    earthContext.fillStyle = continentColors[2];
    for (let i = 0; i < 100; i++) {
        const x = Math.random() * 1024;
        const y = Math.random() * 512;
        const size = Math.random() * 15 + 3;
        earthContext.beginPath();
        earthContext.arc(x, y, size, 0, Math.PI * 2);
        earthContext.fill();
    }

    const earthTexture = new THREE.CanvasTexture(earthCanvas);

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 512;
    bumpCanvas.height = 256;
    const bumpContext = bumpCanvas.getContext('2d')!;

    for (let i = 0; i < 1000; i++) {
        const intensity = Math.random() * 255;
        bumpContext.fillStyle = `rgb(${intensity}, ${intensity}, ${intensity})`;
        const x = Math.random() * 512;
        const y = Math.random() * 256;
        bumpContext.fillRect(x, y, Math.random() * 5 + 1, Math.random() * 5 + 1);
    }

    const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
    const earthMaterial = new THREE.MeshPhongMaterial({
        map: earthTexture,
        bumpMap: bumpTexture,
        bumpScale: 0.1,
        shininess: 100,
        transparent: false,
    });

    return new THREE.Mesh(earthGeometry, earthMaterial);
}

function createDetailedAsteroid(size: number, color: number) {
    const geometry = new THREE.IcosahedronGeometry(size, 2);
    const positionAttribute = geometry.getAttribute('position');
    const positions = positionAttribute.array as Float32Array;

    for (let i = 0; i < positions.length; i += 3) {
        const vertex = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
        const noise = Math.random() * 0.3 + 0.8;
        vertex.multiplyScalar(noise);
        positions[i] = vertex.x;
        positions[i + 1] = vertex.y;
        positions[i + 2] = vertex.z;
    }

    positionAttribute.needsUpdate = true;
    geometry.computeVertexNormals();

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d')!;

    const baseColor = new THREE.Color(color);
    context.fillStyle = `rgb(${Math.floor(baseColor.r * 255)}, ${Math.floor(baseColor.g * 255)}, ${Math.floor(baseColor.b * 255)})`;
    context.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 50; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const radius = Math.random() * 20 + 5;
        const darkness = Math.random() * 0.5 + 0.3;

        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(0, 0, 0, ${darkness})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
    }

    for (let i = 0; i < 200; i++) {
        const brightness = Math.random() * 100 - 50;
        context.fillStyle = `rgba(${brightness + 128}, ${brightness + 128}, ${brightness + 128}, 0.3)`;
        context.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 3 + 1, Math.random() * 3 + 1);
    }

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshPhongMaterial({
        map: texture,
        color,
        shininess: 10,
        bumpMap: texture,
        bumpScale: 0.3,
    });

    return new THREE.Mesh(geometry, material);
}

function createImpactTrajectory(asteroidPosition: THREE.Vector3, riskZones: string[]): THREE.Group {
    const trajectoryGroup = new THREE.Group();
    const zoneCoordinates: { [key: string]: { lat: number; lng: number } } = {
        'Pacific Ocean': { lat: 0, lng: -150 },
        'Coastal Japan': { lat: 36, lng: 138 },
        'Atlantic Ocean': { lat: 30, lng: -30 },
        'European Coast': { lat: 50, lng: 10 },
        'African Coast': { lat: 0, lng: 15 },
        'Indian Ocean': { lat: -20, lng: 80 },
        'Southeast Asia': { lat: 10, lng: 110 },
        'Global Impact': { lat: 0, lng: 0 },
        'Mass Extinction Event': { lat: 0, lng: 0 },
        'Continental Devastation': { lat: 40, lng: -100 },
        'Regional Damage': { lat: 35, lng: 25 },
        'Mediterranean Sea': { lat: 35, lng: 18 },
        'Southern Europe': { lat: 45, lng: 15 },
        'South China Sea': { lat: 15, lng: 115 },
        Philippines: { lat: 12, lng: 122 },
        'Arabian Sea': { lat: 18, lng: 65 },
        'Western India': { lat: 20, lng: 75 },
        'Bay of Bengal': { lat: 15, lng: 90 },
        'Caribbean Sea': { lat: 15, lng: -75 },
        'North Atlantic': { lat: 45, lng: -30 },
        'Central Pacific': { lat: 5, lng: -160 },
        'Hawaiian Islands': { lat: 21, lng: -157 },
        'Remote Ocean': { lat: -30, lng: 150 },
        'Northern Pacific': { lat: 50, lng: -160 },
        Alaska: { lat: 64, lng: -153 },
        'South Atlantic': { lat: -30, lng: -15 },
        'Brazilian Coast': { lat: -15, lng: -45 },
        'Arctic Ocean': { lat: 80, lng: 0 },
        'Red Sea': { lat: 20, lng: 38 },
        'Middle East': { lat: 28, lng: 47 },
        'Eastern Pacific': { lat: -10, lng: -120 },
        'South America West Coast': { lat: -20, lng: -75 },
        'Global Devastation': { lat: 0, lng: 0 },
        Indonesia: { lat: -2, lng: 118 },
        'North Sea': { lat: 56, lng: 3 },
        'Gulf of Mexico': { lat: 25, lng: -90 },
        'Southern Ocean': { lat: -50, lng: 0 },
        'Tasman Sea': { lat: -35, lng: 160 },
        'Black Sea': { lat: 43, lng: 35 },
        'Eastern Europe': { lat: 50, lng: 30 },
        'Western Pacific': { lat: 25, lng: 140 },
        Japan: { lat: 36, lng: 138 },
        Korea: { lat: 37, lng: 127 },
        'Central Atlantic': { lat: 10, lng: -25 },
        'Western Africa': { lat: 10, lng: -10 },
        'Baltic Sea': { lat: 58, lng: 20 },
        'Global Extinction Event': { lat: 0, lng: 0 },
        'Bering Sea': { lat: 58, lng: -175 },
        'North America': { lat: 45, lng: -100 },
        Canada: { lat: 60, lng: -110 },
        'Multiple Continents': { lat: 0, lng: 0 },
    };

    riskZones.forEach((zone) => {
        const coords = zoneCoordinates[zone];
        if (coords) {
            const phi = (90 - coords.lat) * (Math.PI / 180);
            const theta = (coords.lng + 180) * (Math.PI / 180);
            const radius = 6.1;
            const impactX = -(radius * Math.sin(phi) * Math.cos(theta));
            const impactZ = radius * Math.sin(phi) * Math.sin(theta);
            const impactY = radius * Math.cos(phi);
            const impactPoint = new THREE.Vector3(impactX, impactY, impactZ);

            const trajectoryPoints = [];
            trajectoryPoints.push(asteroidPosition.clone());
            const midPoint = new THREE.Vector3().lerpVectors(asteroidPosition, impactPoint, 0.5);
            midPoint.y += 3;
            trajectoryPoints.push(midPoint);
            trajectoryPoints.push(impactPoint);

            const trajectoryGeometry = new THREE.CatmullRomCurve3(trajectoryPoints);
            const points = trajectoryGeometry.getPoints(50);
            const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
            const lineMaterial = new THREE.LineBasicMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.7,
                linewidth: 3,
            });

            const trajectoryLine = new THREE.Line(lineGeometry, lineMaterial);
            trajectoryGroup.add(trajectoryLine);

            const impactGeometry = new THREE.SphereGeometry(0.8, 16, 16);
            const impactMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.9,
            });

            const impactMarker = new THREE.Mesh(impactGeometry, impactMaterial);
            impactMarker.position.copy(impactPoint);
            trajectoryGroup.add(impactMarker);

            const pulseGeometry = new THREE.RingGeometry(1.2, 2.0, 32);
            const pulseMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.4,
                side: THREE.DoubleSide,
            });

            const pulseRing = new THREE.Mesh(pulseGeometry, pulseMaterial);
            pulseRing.position.copy(impactPoint);
            pulseRing.lookAt(new THREE.Vector3(0, 0, 0));
            trajectoryGroup.add(pulseRing);
        }
    });

    return trajectoryGroup;
}

export default function App(): JSX.Element {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const [selectedAsteroid, setSelectedAsteroid] = useState<AsteroidData | null>(null);
    const [hoveredAsteroid, setHoveredAsteroid] = useState<AsteroidData | null>(null);
    const [showOrbits, setShowOrbits] = useState<boolean>(true);
    const [maxAsteroids, setMaxAsteroids] = useState<number>(0);
    const [cameraDistance, setCameraDistance] = useState<number>(35);
    const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);

    const [asteroidData, setAsteroidData] = useState<AsteroidData[]>([]);
    const [isLoadingAsteroids, setIsLoadingAsteroids] = useState<boolean>(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const asteroidMeshes = useRef<Record<string, AsteroidMesh>>({});
    const hitboxMeshes = useRef<Record<string, THREE.Mesh>>({});
    const currentImpactTrajectory = useRef<THREE.Group | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const earthRef = useRef<THREE.Mesh | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const animationIdRef = useRef<number | null>(null);
    const isInitialized = useRef<boolean>(false);
    const selectedAsteroidRef = useRef<AsteroidData | null>(null);

    useEffect(() => {
        selectedAsteroidRef.current = selectedAsteroid;
    }, [selectedAsteroid]);

    useEffect(() => {
        const fetchAsteroidData = async () => {
            setIsLoadingAsteroids(true);
            setLoadError(null);

            try {
                const response = await fetch(`${API_BASE_URL}/database/asteroids`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data: any[] = await response.json();

                const enrichedData: AsteroidData[] = data.map((asteroid) => {
                    const diameterKm = asteroid.estimated_diameter_km_max;
                    const velocityKmS = asteroid.relative_velocity_km_s;
                    const missDistanceAU = asteroid.miss_distance_au;
                    const isPHA = asteroid.is_potentially_hazardous_asteroid;
                    const isSentry = asteroid.is_sentry_object;

                    const energyMegatons = calculateImpactEnergy(diameterKm, velocityKmS);
                    const torinoScale = calculateTorinoScale(diameterKm, energyMegatons, isPHA, isSentry);
                    const craterKm = calculateCraterSize(diameterKm, velocityKmS);
                    const riskZones = generateRiskZones(energyMegatons, isPHA, isSentry);
                    const importanceScore = calculateImportanceScore(
                        diameterKm,
                        velocityKmS,
                        missDistanceAU,
                        isPHA,
                        isSentry,
                    );

                    return {
                        ...asteroid,
                        impact: {
                            energy_megatons: energyMegatons,
                            crater_km: craterKm,
                            risk_zones: riskZones,
                        },
                        torino_scale: torinoScale,
                        importance_score: importanceScore,
                    };
                });

                const sortedData = enrichedData.sort((a, b) => b.importance_score - a.importance_score);

                setAsteroidData(sortedData);
                setMaxAsteroids(sortedData.length);

                console.log(`🛰️ Loaded ${sortedData.length} asteroids from API`);
            } catch (error) {
                console.error('Failed to fetch asteroid data:', error);
                setLoadError(error instanceof Error ? error.message : 'Unknown error occurred');
                setAsteroidData([]);
                setMaxAsteroids(0);
            } finally {
                setIsLoadingAsteroids(false);
            }
        };

        fetchAsteroidData();
    }, []);

    const animationSpeed = 1.0;
    const visibleAsteroids = useMemo(() => {
        return asteroidData.slice(0, maxAsteroids);
    }, [maxAsteroids, asteroidData]);

    const generateAIReport = async () => {
        setIsGeneratingReport(true);
        try {
            const asteroidIds = visibleAsteroids.map((asteroid) => asteroid.id);
            const response = await fetch(`${API_BASE_URL}/ai/report`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    asteroidIds: asteroidIds,
                }),
            });

            if (response.ok) {
                const htmlContent = await response.text();
                const newTab = window.open('', '_blank');
                if (newTab) {
                    newTab.document.write(htmlContent);
                    newTab.document.close();
                    console.log(`✅ AI Report opened in new tab for ${asteroidIds.length} asteroids`);
                } else {
                    alert('❌ Please allow pop-ups to view the report');
                }
            } else {
                console.error('Failed to generate report:', response.statusText);
                alert('❌ Failed to generate AI report. Please try again.');
            }
        } catch (error) {
            console.error('Error generating report:', error);
            alert('❌ Network error while generating AI report. Please check your connection.');
        } finally {
            setIsGeneratingReport(false);
        }
    };

    const generateSingleAsteroidReport = async () => {
        if (!selectedAsteroid) return;

        setIsGeneratingReport(true);
        try {
            const response = await fetch(`${API_BASE_URL}/ai/report`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    asteroidIds: [selectedAsteroid.id],
                }),
            });

            if (response.ok) {
                const htmlContent = await response.text();
                const newTab = window.open('', '_blank');
                if (newTab) {
                    newTab.document.write(htmlContent);
                    newTab.document.close();
                    console.log(`✅ Report for ${selectedAsteroid.name} opened in new tab`);
                } else {
                    alert('❌ Please allow pop-ups to view the report');
                }
            } else {
                console.error('Failed to generate single asteroid report:', response.statusText);
                alert('❌ Failed to generate asteroid report. Please try again.');
            }
        } catch (error) {
            console.error('Error generating single asteroid report:', error);
            alert('❌ Network error while generating asteroid report. Please check your connection.');
        } finally {
            setIsGeneratingReport(false);
        }
    };

    const recreateAsteroids = () => {
        if (!sceneRef.current || visibleAsteroids.length === 0) return;
        const scene = sceneRef.current;

    // Clean up old meshes and hitboxes
        Object.values(asteroidMeshes.current).forEach((mesh) => {
            scene.remove(mesh);
            mesh.geometry.dispose();
            if (mesh.material instanceof THREE.Material) {
                mesh.material.dispose();
            }
        });
        Object.values(hitboxMeshes.current).forEach((hitbox) => {
            scene.remove(hitbox);
            hitbox.geometry.dispose();
            if (hitbox.material instanceof THREE.Material) {
                hitbox.material.dispose();
            }
        });
        asteroidMeshes.current = {};
        hitboxMeshes.current = {};

        const calculateDynamicRings = () => {
            const maxAsteroidsPerRing = 5;
            const baseDistance = 15;
            const ringGap = 12;

            const criticalAsteroids = visibleAsteroids.filter(
                (a) => a.is_sentry_object || a.torino_scale >= 3,
            );
            const hazardousAsteroids = visibleAsteroids.filter(
                (a) =>
                    !criticalAsteroids.includes(a) &&
                    (a.is_potentially_hazardous_asteroid || a.torino_scale >= 1),
            );
            const regularAsteroids = visibleAsteroids.filter(
                (a) => !criticalAsteroids.includes(a) && !hazardousAsteroids.includes(a),
            );

            const criticalRings = Math.max(1, Math.ceil(criticalAsteroids.length / maxAsteroidsPerRing));
            const hazardousRings = Math.max(0, Math.ceil(hazardousAsteroids.length / maxAsteroidsPerRing));
            const regularRings = Math.max(0, Math.ceil(regularAsteroids.length / maxAsteroidsPerRing));

            const rings = [];
            let currentDistance = baseDistance;

            for (let i = 0; i < criticalRings; i++) {
                rings.push({
                    distance: currentDistance,
                    type: 'critical',
                    color: 0xff4444,
                    opacity: 0.2,
                });
                currentDistance += ringGap;
            }

            for (let i = 0; i < hazardousRings; i++) {
                rings.push({
                    distance: currentDistance,
                    type: 'hazardous',
                    color: 0xff8844,
                    opacity: 0.15,
                });
                currentDistance += ringGap;
            }

            for (let i = 0; i < regularRings; i++) {
                rings.push({
                    distance: currentDistance,
                    type: 'regular',
                    color: 0x888888,
                    opacity: 0.1,
                });
                currentDistance += ringGap;
            }

            return {
                rings,
                criticalAsteroids,
                hazardousAsteroids,
                regularAsteroids,
                maxAsteroidsPerRing,
            };
        };

        const {
            rings,
            criticalAsteroids,
            hazardousAsteroids,
            regularAsteroids,
            maxAsteroidsPerRing,
        } = calculateDynamicRings();

        const hazardousRingIndex =
            criticalAsteroids.length > 0
                ? Math.ceil(criticalAsteroids.length / maxAsteroidsPerRing)
                : 0;
        const regularRingIndex =
            hazardousRingIndex +
            (hazardousAsteroids.length > 0
                ? Math.ceil(hazardousAsteroids.length / maxAsteroidsPerRing)
                : 0);

        visibleAsteroids.forEach((asteroid) => {
            let ringIndex, asteroidList, localIndex;

            if (criticalAsteroids.includes(asteroid)) {
                ringIndex = Math.floor(criticalAsteroids.indexOf(asteroid) / maxAsteroidsPerRing);
                asteroidList = criticalAsteroids;
                localIndex = criticalAsteroids.indexOf(asteroid);
            } else if (hazardousAsteroids.includes(asteroid)) {
                ringIndex =
                    hazardousRingIndex +
                    Math.floor(hazardousAsteroids.indexOf(asteroid) / maxAsteroidsPerRing);
                asteroidList = hazardousAsteroids;
                localIndex = hazardousAsteroids.indexOf(asteroid);
            } else {
                ringIndex =
                    regularRingIndex +
                    Math.floor(regularAsteroids.indexOf(asteroid) / maxAsteroidsPerRing);
                asteroidList = regularAsteroids;
                localIndex = regularAsteroids.indexOf(asteroid);
            }

            const ring = rings[ringIndex];
            if (!ring) return;

            let distance = ring.distance;
            distance += (Math.random() - 0.5) * 3;

            let size;
            const diameterKm = asteroid.estimated_diameter_km_max;

            if (diameterKm > 20) {
                size = Math.min(diameterKm * 0.08, 5);
            } else if (diameterKm > 5) {
                size = Math.max(diameterKm * 0.15, 1.0);
            } else if (diameterKm > 1) {
                size = Math.max(diameterKm * 0.3, 0.8);
            } else {
                size = Math.max(diameterKm * 1.0, 0.8);
            }

            const asteroidIndexInRing = localIndex % maxAsteroidsPerRing;
            const totalInThisRing = Math.min(
                maxAsteroidsPerRing,
                asteroidList.length - Math.floor(localIndex / maxAsteroidsPerRing) * maxAsteroidsPerRing,
            );

            let initialAngle;
            if (totalInThisRing === 1) {
                initialAngle = 0;
            } else {
                initialAngle = (asteroidIndexInRing / totalInThisRing) * Math.PI * 2;
            }

            const x = Math.cos(initialAngle) * distance;
            const z = Math.sin(initialAngle) * distance;
            const y = (Math.random() - 0.5) * 1;

            // Color assignment: check each condition separately
            let color = 0xdddddd;
            let emissive = 0x111111;

            // Check conditions in order
            if (asteroid.is_sentry_object) {
                // 1. CRITICAL: Sentry objects (RED)
                color = 0xff3333;
                emissive = 0x441111;
                console.log(`🔴 SENTRY: ${asteroid.name} - ${diameterKm.toFixed(2)}km`);
            } else if (asteroid.is_potentially_hazardous_asteroid) {
                // 2. HIGH RISK: Potentially hazardous (ORANGE)
                color = 0xff8800;
                emissive = 0x221100;
                console.log(`🟠 PHA: ${asteroid.name} - ${diameterKm.toFixed(2)}km`);
            } else if (diameterKm > 10) {
                // 3. LARGE OBJECTS: Diameter > 10km (YELLOW)
                color = 0xffdd00;
                emissive = 0x332200;
                console.log(`🟡 LARGE: ${asteroid.name} - ${diameterKm.toFixed(2)}km`);
            } else if (diameterKm > 1) {
                // 4. MEDIUM OBJECTS: Diameter > 1km (WHITE)
                color = 0xeeeeee;
                emissive = 0x111111;
            }
            // 5. Small objects: default gray

            const asteroidMesh = createDetailedAsteroid(size, color);
            asteroidMesh.userData = asteroid;
            const typedMesh = asteroidMesh as unknown as AsteroidMesh;

            typedMesh.position.set(x, y, z);
            typedMesh.orbitRing = ringIndex;
            typedMesh.orbitRadius = distance;
            typedMesh.orbitSpeed = asteroid.relative_velocity_km_s * 0.0001;
            typedMesh.orbitAngle = initialAngle;
            typedMesh.orbitCenter = new THREE.Vector3(0, y, 0);
            typedMesh.originalScale = size;
            typedMesh.originalColor = color;
            typedMesh.originalEmissive = emissive;
            typedMesh.originalEmissiveIntensity = 0.5;

            const material = typedMesh.material as THREE.MeshPhongMaterial;
            material.emissive = new THREE.Color(emissive);
            material.emissiveIntensity = 0.5;

            scene.add(typedMesh);
            asteroidMeshes.current[asteroid.id] = typedMesh;

            // Create invisible hitbox
            const hitboxSize = size * 3;
            const hitboxGeometry = new THREE.SphereGeometry(hitboxSize, 8, 8);
            const hitboxMaterial = new THREE.MeshBasicMaterial({
                visible: false,
                transparent: true,
                opacity: 0,
            });
            const hitboxMesh = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
            hitboxMesh.position.copy(typedMesh.position);
            hitboxMesh.userData = asteroid;
            scene.add(hitboxMesh);
            hitboxMeshes.current[asteroid.id] = hitboxMesh;
        });

        if (showOrbits) {
            const oldRings = scene.children.filter((child) => child.userData?.isOrbitRing);
            oldRings.forEach((ring) => scene.remove(ring));

            rings.forEach((ring, ringIndex) => {
                const orbitGeometry = new THREE.RingGeometry(ring.distance - 0.5, ring.distance + 0.5, 64);
                const orbitMaterial = new THREE.MeshBasicMaterial({
                    color: ring.color,
                    transparent: true,
                    opacity: ring.opacity,
                    side: THREE.DoubleSide,
                });
                const orbitRing = new THREE.Mesh(orbitGeometry, orbitMaterial);
                orbitRing.rotation.x = Math.PI / 2;
                orbitRing.userData = {
                    isOrbitRing: true,
                    ringType: ring.type,
                    ringIndex,
                };
                scene.add(orbitRing);
            });
        }

        console.log(
            `🛰️ Created ${rings.length} dynamic rings with ${Object.keys(asteroidMeshes.current).length} asteroids`,
        );
    };

    useEffect(() => {
        if (isInitialized.current && !isLoadingAsteroids) {
            recreateAsteroids();
        }
    }, [maxAsteroids, visibleAsteroids, asteroidData, isLoadingAsteroids]);

    useEffect(() => {
        if (isInitialized.current && sceneRef.current && !isLoadingAsteroids) {
            const scene = sceneRef.current;
            const oldRings = scene.children.filter((child) => child.userData?.isOrbitRing);
            oldRings.forEach((ring) => scene.remove(ring));
            if (showOrbits) {
                recreateAsteroids();
            }
        }
    }, [showOrbits, isLoadingAsteroids]);

    useEffect(() => {
        if (!mountRef.current || isInitialized.current || isLoadingAsteroids) return;
        isInitialized.current = true;

        const scene = new THREE.Scene();
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(
            75,
            mountRef.current.clientWidth / mountRef.current.clientHeight,
            0.1,
            10000,
        );
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        rendererRef.current = renderer;
        renderer.setClearColor(0x000011);
        renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
        mountRef.current.appendChild(renderer.domElement);

        const starField = createStarField();
        scene.add(starField);

        const ambientLight = new THREE.AmbientLight(0x404040, 1.2);
        scene.add(ambientLight);
        const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x362d1e, 0.6);
        scene.add(hemisphereLight);
        const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
        sunLight.position.set(15, 0, 10);
        scene.add(sunLight);

        const earth = createDetailedEarth();
        scene.add(earth);
        earthRef.current = earth;

        camera.position.set(35, 35 * 0.4, 35);
        camera.lookAt(0, 0, 0);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0, 0);
        controls.enableDamping = false;
        controls.enableZoom = true;
        controls.enableRotate = true;
        controls.enablePan = true;
        controls.minDistance = 8;
        controls.maxDistance = 200;
        controls.maxPolarAngle = Math.PI;
        controls.autoRotate = false;
        controlsRef.current = controls;

        recreateAsteroids();

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        let previousHovered: AsteroidMesh | null = null;
        let mouseDownTime = 0;
        let mouseDownPosition = { x: 0, y: 0 };
        let isDragging = false;

        const onMouseDown = (event: MouseEvent): void => {
            mouseDownTime = Date.now();
            mouseDownPosition = { x: event.clientX, y: event.clientY };
            isDragging = false;
        };

        const onMouseMove = (event: MouseEvent): void => {
            if (!mountRef.current) return;

            if (mouseDownTime > 0) {
                const dragDistance = Math.sqrt(
                    (event.clientX - mouseDownPosition.x) ** 2 +
                        (event.clientY - mouseDownPosition.y) ** 2,
                );
                if (dragDistance > 5) {
                    isDragging = true;
                }
            }

            const rect = mountRef.current.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            
            // Use hitboxes for raycasting instead of visual meshes
            const intersects = raycaster.intersectObjects(Object.values(hitboxMeshes.current));

            if (previousHovered) {
                const actualMesh = asteroidMeshes.current[previousHovered.userData.id];
                if (actualMesh) {
                    const material = actualMesh.material as THREE.MeshPhongMaterial;
                    material.emissive.setHex(actualMesh.originalEmissive!);
                    material.emissiveIntensity = actualMesh.originalEmissiveIntensity!;
                    actualMesh.scale.setScalar(1);
                }
                document.body.style.cursor = 'default';
                previousHovered = null;
                setHoveredAsteroid(null);
            }

            if (intersects.length > 0) {
                const hoveredHitbox = intersects[0].object;
                const asteroidId = (hoveredHitbox.userData as AsteroidData).id;
                const hoveredMesh = asteroidMeshes.current[asteroidId];
                
                if (hoveredMesh) {
                    const material = hoveredMesh.material as THREE.MeshPhongMaterial;
                    material.emissiveIntensity = 2.0;
                    hoveredMesh.scale.setScalar(1.3);
                    document.body.style.cursor = 'pointer';
                    previousHovered = hoveredMesh as AsteroidMesh;
                    setHoveredAsteroid(hoveredMesh.userData);
                }
            }
        };

        const onMouseUp = (event: MouseEvent): void => {
            if (!mountRef.current) return;
            const clickDuration = Date.now() - mouseDownTime;

            if (!isDragging && clickDuration < 300) {
                const rect = mountRef.current.getBoundingClientRect();
                mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

                raycaster.setFromCamera(mouse, camera);
                
                // Use hitboxes for clicking
                const intersects = raycaster.intersectObjects(Object.values(hitboxMeshes.current));

                if (intersects.length > 0) {
                    const clickedHitbox = intersects[0].object;
                    const asteroidId = (clickedHitbox.userData as AsteroidData).id;
                    const clickedMesh = asteroidMeshes.current[asteroidId];
                    
                    if (clickedMesh) {
                        setSelectedAsteroid(clickedMesh.userData);

                        if (currentImpactTrajectory.current) {
                            scene.remove(currentImpactTrajectory.current);
                            currentImpactTrajectory.current = null;
                        }

                        const trajectory = createImpactTrajectory(
                            clickedMesh.position,
                            clickedMesh.userData.impact.risk_zones,
                        );
                        scene.add(trajectory);
                        currentImpactTrajectory.current = trajectory;

                        const originalScale = clickedMesh.scale.x;
                        clickedMesh.scale.setScalar(originalScale * 0.9);
                        setTimeout(() => {
                            if (clickedMesh.scale) {
                                clickedMesh.scale.setScalar(originalScale);
                            }
                        }, 100);
                    }
                } else {
                    setSelectedAsteroid(null);
                    if (currentImpactTrajectory.current) {
                        scene.remove(currentImpactTrajectory.current);
                        currentImpactTrajectory.current = null;
                    }
                }
            }
            mouseDownTime = 0;
            isDragging = false;
        };

        mountRef.current.addEventListener('mousedown', onMouseDown);
        mountRef.current.addEventListener('mousemove', onMouseMove);
        mountRef.current.addEventListener('mouseup', onMouseUp);

        let frameCount = 0;
        const animate = (): void => {
            if (animationIdRef.current) {
                cancelAnimationFrame(animationIdRef.current);
            }
            animationIdRef.current = requestAnimationFrame(animate);
            frameCount++;

            controls.update();

            if (frameCount % 300 === 0) {
                const currentDistance = camera.position.distanceTo(controls.target);
                const roundedDistance = Math.round(currentDistance * 10) / 10;
                if (Math.abs(roundedDistance - cameraDistance) > 1) {
                    setCameraDistance(roundedDistance);
                }
            }

            const isAnimationsPaused = selectedAsteroidRef.current !== null;

            if (!isAnimationsPaused && earthRef.current) {
                earthRef.current.rotation.y += 0.008 * animationSpeed;
            }

            const time = Date.now() * 0.001;

            if (!isAnimationsPaused) {
                Object.entries(asteroidMeshes.current).forEach(([id, mesh]) => {
                    const asteroid = mesh.userData;
                    const rotSpeed = asteroid.relative_velocity_km_s * 0.0001 * animationSpeed;
                    mesh.rotation.x += rotSpeed * 0.5;
                    mesh.rotation.y += rotSpeed;

                    if (
                        mesh.orbitRadius &&
                        mesh.orbitSpeed !== undefined &&
                        mesh.orbitAngle !== undefined &&
                        mesh.orbitCenter
                    ) {
                        mesh.orbitAngle += mesh.orbitSpeed * animationSpeed;
                        mesh.position.x = Math.cos(mesh.orbitAngle) * mesh.orbitRadius;
                        mesh.position.z = Math.sin(mesh.orbitAngle) * mesh.orbitRadius;
                        mesh.position.y = mesh.orbitCenter.y;
                        
                        // Update hitbox position to match asteroid
                        const hitbox = hitboxMeshes.current[id];
                        if (hitbox) {
                            hitbox.position.copy(mesh.position);
                        }
                    }
                });
            }

            Object.values(asteroidMeshes.current).forEach((mesh) => {
                const asteroid = mesh.userData;
                const material = mesh.material as THREE.MeshPhongMaterial;
                const isSelected =
                    selectedAsteroidRef.current && asteroid.id === selectedAsteroidRef.current.id;

                if (isSelected) {
                    const pulseIntensity = 1.0 + Math.sin(time * 3) * 0.05;
                    mesh.scale.setScalar(pulseIntensity);
                    material.emissiveIntensity = 1.5 + Math.sin(time * 2) * 0.3;
                } else if (
                    (asteroid.is_sentry_object || asteroid.is_potentially_hazardous_asteroid) &&
                    mesh !== previousHovered
                ) {
                    const glowIntensity = 0.5 + Math.sin(time * 1.5) * 0.3;
                    material.emissiveIntensity = glowIntensity;
                    if (mesh.scale.x !== 1) {
                        mesh.scale.setScalar(1);
                    }
                } else {
                    if (mesh.scale.x !== 1) {
                        mesh.scale.setScalar(1);
                    }
                    if (material.emissiveIntensity !== mesh.originalEmissiveIntensity) {
                        material.emissiveIntensity = mesh.originalEmissiveIntensity!;
                    }
                }
            });

            if (currentImpactTrajectory.current) {
                currentImpactTrajectory.current.children.forEach((child, childIndex) => {
                    if (child.type === 'Mesh' && childIndex % 3 === 2) {
                        const scale = 1 + Math.sin(time * 3 + childIndex) * 0.3;
                        child.scale.setScalar(scale);
                        const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
                        material.opacity = 0.4 + Math.sin(time * 2 + childIndex) * 0.2;
                    }
                });
            }

            renderer.render(scene, camera);
        };
        animate();

        return () => {
            if (animationIdRef.current) {
                cancelAnimationFrame(animationIdRef.current);
                animationIdRef.current = null;
            }
            controls.dispose();
            if (mountRef.current && renderer.domElement.parentNode) {
                mountRef.current.removeChild(renderer.domElement);
            }
            mountRef.current?.removeEventListener('mousedown', onMouseDown);
            mountRef.current?.removeEventListener('mousemove', onMouseMove);
            mountRef.current?.removeEventListener('mouseup', onMouseUp);
            if (currentImpactTrajectory.current) {
                scene.remove(currentImpactTrajectory.current);
            }
            Object.values(asteroidMeshes.current).forEach((mesh) => {
                mesh.geometry.dispose();
                if (mesh.material instanceof THREE.Material) {
                    mesh.material.dispose();
                }
            });
            Object.values(hitboxMeshes.current).forEach((hitbox) => {
                hitbox.geometry.dispose();
                if (hitbox.material instanceof THREE.Material) {
                    hitbox.material.dispose();
                }
            });
            renderer.dispose();
            isInitialized.current = false;
        };
    }, [isLoadingAsteroids]);

    const getRiskLevel = (asteroid: AsteroidData): string => {
        if (asteroid.is_sentry_object) return 'CRITICAL';
        if (asteroid.is_potentially_hazardous_asteroid) return 'HIGH';
        if (asteroid.importance_score > 6) return 'MODERATE';
        return 'LOW';
    };

    const getRiskColor = (level: string): string => {
        switch (level) {
            case 'CRITICAL':
                return 'text-red-100 bg-red-900';
            case 'HIGH':
                return 'text-orange-100 bg-orange-900';
            case 'MODERATE':
                return 'text-yellow-100 bg-yellow-900';
            default:
                return 'text-emerald-100 bg-emerald-900';
        }
    };

    const formatNumber = (num: number): string => {
        return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
    };

    if (isLoadingAsteroids) {
        return (
            <div
                className="flex h-screen items-center justify-center"
                style={{ backgroundColor: '#051622' }}
            >
                <div className="text-center">
                    <div
                        className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4"
                        style={{ borderColor: '#1ba098' }}
                    ></div>
                    <h2 className="text-2xl font-light mb-2" style={{ color: '#1ba098' }}>
                        Loading Asteroid Data
                    </h2>
                    <p className="text-sm opacity-70" style={{ color: '#deb992' }}>
                        Fetching from database...
                    </p>
                </div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div
                className="flex h-screen items-center justify-center"
                style={{ backgroundColor: '#051622' }}
            >
                <div className="text-center max-w-md">
                    <div className="text-red-400 text-4xl mb-4">⚠️</div>
                    <h2 className="text-2xl font-light mb-4" style={{ color: '#1ba098' }}>
                        Failed to Load Data
                    </h2>
                    <p className="text-sm mb-4" style={{ color: '#deb992' }}>
                        {loadError}
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-3 rounded-xl font-medium transition-all hover:scale-105"
                        style={{
                            background: 'linear-gradient(135deg, #1ba098, #0d7377)',
                            color: '#051622',
                        }}
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (!asteroidData.length) {
        return (
            <div
                className="flex h-screen items-center justify-center"
                style={{ backgroundColor: '#051622' }}
            >
                <div className="text-center">
                    <div className="text-yellow-400 text-4xl mb-4">📡</div>
                    <h2 className="text-2xl font-light mb-4" style={{ color: '#1ba098' }}>
                        No Asteroid Data
                    </h2>
                    <p className="text-sm" style={{ color: '#deb992' }}>
                        No asteroids found in database
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen" style={{ backgroundColor: '#051622', color: '#deb992' }}>
            <div className="flex-1 relative">
                <div ref={mountRef} className="w-full h-full" />

                <div
                    className="absolute top-6 left-6 backdrop-blur-lg rounded-2xl p-6"
                    style={{
                        backgroundColor: 'rgba(27, 160, 152, 0.1)',
                        border: '1px solid rgba(222, 185, 146, 0.2)',
                    }}
                >
                    <h3
                        className="text-2xl font-light tracking-wide mb-6"
                        style={{ color: '#1ba098' }}
                    >
                        Asteroid Monitor
                    </h3>

                    <div className="space-y-4">
                        <label className="flex items-center space-x-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={showOrbits}
                                onChange={(e) => setShowOrbits(e.target.checked)}
                                className="w-5 h-5 rounded"
                                style={{ accentColor: '#1ba098' }}
                            />
                            <span className="text-sm font-medium">Orbital Paths</span>
                        </label>

                        <div className="space-y-2">
                            <label className="block text-sm font-medium">
                                Objects: {maxAsteroids} / {asteroidData.length}
                            </label>
                            <input
                                type="range"
                                min="1"
                                max={asteroidData.length}
                                step="1"
                                value={maxAsteroids}
                                onChange={(e) => setMaxAsteroids(Number.parseInt(e.target.value))}
                                className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                                style={{
                                    background: 'rgba(222, 185, 146, 0.2)',
                                    accentColor: '#1ba098',
                                }}
                            />
                        </div>

                        <div
                            className="text-xs opacity-70 pt-3 border-t"
                            style={{ borderColor: 'rgba(222, 185, 146, 0.2)' }}
                        >
                            Distance: {cameraDistance.toFixed(1)} units
                        </div>
                    </div>
                </div>

                <div
                    className="absolute top-6 right-6 backdrop-blur-lg rounded-2xl p-6"
                    style={{
                        backgroundColor: 'rgba(27, 160, 152, 0.1)',
                        border: '1px solid rgba(222, 185, 146, 0.2)',
                    }}
                >
                    <h4 className="text-lg font-light mb-4" style={{ color: '#1ba098' }}>
                        Legend
                    </h4>
                    <div className="space-y-3 text-sm">
                        <div className="flex items-center space-x-3">
                            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                            <span>Earth</span>
                        </div>
                        <div className="flex items-center space-x-3">
                            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                            <span>Critical Risk</span>
                        </div>
                        <div className="flex items-center space-x-3">
                            <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                            <span>High Risk</span>
                        </div>
                        <div className="flex items-center space-x-3">
                            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                            <span>Large Objects</span>
                        </div>

                        {hoveredAsteroid && (
                            <div
                                className="mt-4 pt-4 border-t"
                                style={{ borderColor: 'rgba(222, 185, 146, 0.2)' }}
                            >
                                <div className="text-sm font-semibold" style={{ color: '#1ba098' }}>
                                    {hoveredAsteroid.name}
                                </div>
                                <div className="text-xs opacity-70">
                                    {hoveredAsteroid.estimated_diameter_km_max.toFixed(2)} km diameter
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div
                className="w-80 h-screen backdrop-blur-xl p-6 flex flex-col"
                style={{
                    backgroundColor: 'rgba(5, 22, 34, 0.95)',
                    borderLeft: '1px solid rgba(222, 185, 146, 0.2)',
                }}
            >
                <h2 className="text-3xl font-light tracking-wide mb-6" style={{ color: '#1ba098' }}>
                    Analysis
                </h2>

                {selectedAsteroid ? (
                    <div className="space-y-4 flex-1 flex flex-col overflow-y-auto">
                        <div
                            className="p-4 rounded-2xl flex-shrink-0"
                            style={{
                                backgroundColor: 'rgba(27, 160, 152, 0.1)',
                                border: '1px solid rgba(222, 185, 146, 0.2)',
                            }}
                        >
                            <h3 className="text-lg font-medium mb-2" style={{ color: '#deb992' }}>
                                {selectedAsteroid.name}
                            </h3>
                            <div className="flex flex-wrap gap-2 mb-2">
                                <span
                                    className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskColor(getRiskLevel(selectedAsteroid))}`}
                                >
                                    {getRiskLevel(selectedAsteroid)}
                                </span>
                                <span
                                    className="px-2 py-1 rounded-full text-xs font-medium"
                                    style={{
                                        backgroundColor: 'rgba(27, 160, 152, 0.2)',
                                        color: '#1ba098',
                                    }}
                                >
                                    Torino {selectedAsteroid.torino_scale}
                                </span>
                            </div>
                            <a
                                href={selectedAsteroid.nasa_jpl_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs underline opacity-70 hover:opacity-100 transition-opacity"
                                style={{ color: '#1ba098' }}
                            >
                                NASA JPL Data
                            </a>
                        </div>

                        <div
                            className="p-4 rounded-2xl flex-shrink-0"
                            style={{
                                backgroundColor: 'rgba(27, 160, 152, 0.1)',
                                border: '1px solid rgba(222, 185, 146, 0.2)',
                            }}
                        >
                            <h4 className="font-medium mb-3" style={{ color: '#1ba098' }}>
                                Properties
                            </h4>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <span className="opacity-70 text-xs">Diameter</span>
                                    <p className="font-mono" style={{ color: '#deb992' }}>
                                        {formatNumber(selectedAsteroid.estimated_diameter_km_max)} km
                                    </p>
                                </div>
                                <div>
                                    <span className="opacity-70 text-xs">Velocity</span>
                                    <p className="font-mono" style={{ color: '#deb992' }}>
                                        {formatNumber(selectedAsteroid.relative_velocity_km_s)} km/s
                                    </p>
                                </div>
                                <div>
                                    <span className="opacity-70 text-xs">Distance</span>
                                    <p className="font-mono" style={{ color: '#deb992' }}>
                                        {formatNumber(selectedAsteroid.miss_distance_au)} AU
                                    </p>
                                </div>
                                <div>
                                    <span className="opacity-70 text-xs">Impact Energy</span>
                                    <p className="font-mono text-red-400">
                                        {formatNumber(selectedAsteroid.impact.energy_megatons)} Mt
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div
                            className="p-4 rounded-2xl flex-shrink-0"
                            style={{
                                backgroundColor: 'rgba(27, 160, 152, 0.1)',
                                border: '1px solid rgba(222, 185, 146, 0.2)',
                            }}
                        >
                            <h4 className="font-medium mb-3" style={{ color: '#1ba098' }}>
                                Risk Zones
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {selectedAsteroid.impact.risk_zones.map((zone, index) => (
                                    <span
                                        key={index}
                                        className="px-2 py-1 rounded-full text-xs font-medium bg-red-900 text-red-100"
                                    >
                                        {zone}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div
                            className="p-4 rounded-2xl flex-shrink-0"
                            style={{
                                backgroundColor: 'rgba(27, 160, 152, 0.1)',
                                border: '1px solid rgba(222, 185, 146, 0.2)',
                            }}
                        >
                            <button
                                type="button"
                                onClick={generateSingleAsteroidReport}
                                disabled={isGeneratingReport}
                                className={`w-full p-3 rounded-xl font-medium transition-all ${
                                    isGeneratingReport
                                        ? 'opacity-50 cursor-not-allowed'
                                        : 'hover:scale-105'
                                }`}
                                style={{
                                    background: 'linear-gradient(135deg, #1ba098, #0d7377)',
                                    color: '#051622',
                                }}
                            >
                                {isGeneratingReport ? (
                                    <div className="flex items-center justify-center space-x-3">
                                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                        <span>Analyzing...</span>
                                    </div>
                                ) : (
                                    'Generate Report'
                                )}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 flex-1">
                        <div
                            className="p-5 rounded-2xl"
                            style={{
                                backgroundColor: 'rgba(27, 160, 152, 0.1)',
                                border: '1px solid rgba(222, 185, 146, 0.2)',
                            }}
                        >
                            <h4 className="font-medium mb-4" style={{ color: '#1ba098' }}>
                                AI Analysis
                            </h4>
                            <div className="space-y-3 mb-4 text-sm">
                                <div className="flex justify-between">
                                    <span className="opacity-70">Objects</span>
                                    <span style={{ color: '#1ba098' }}>{maxAsteroids}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="opacity-70">Type</span>
                                    <span style={{ color: '#1ba098' }}>Comprehensive</span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={generateAIReport}
                                disabled={isGeneratingReport}
                                className={`w-full p-4 rounded-xl font-medium transition-all ${
                                    isGeneratingReport
                                        ? 'opacity-50 cursor-not-allowed'
                                        : 'hover:scale-105'
                                }`}
                                style={{
                                    background: 'linear-gradient(135deg, #1ba098, #0d7377)',
                                    color: '#051622',
                                }}
                            >
                                {isGeneratingReport ? (
                                    <div className="flex items-center justify-center space-x-3">
                                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                        <span>Analyzing...</span>
                                    </div>
                                ) : (
                                    'Generate Report'
                                )}
                            </button>
                        </div>

                        <div
                            className="p-5 rounded-2xl"
                            style={{
                                backgroundColor: 'rgba(27, 160, 152, 0.1)',
                                border: '1px solid rgba(222, 185, 146, 0.2)',
                            }}
                        >
                            <h4 className="font-medium mb-4" style={{ color: '#1ba098' }}>
                                Dynamic Rings
                            </h4>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span>Max per Ring</span>
                                    <span style={{ color: '#1ba098' }}>5 Objects</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Ring Spacing</span>
                                    <span style={{ color: '#1ba098' }}>12 Units</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Auto-Creation</span>
                                    <span className="text-green-400">Enabled</span>
                                </div>
                            </div>
                        </div>

                        <div
                            className="p-5 rounded-2xl"
                            style={{
                                backgroundColor: 'rgba(27, 160, 152, 0.1)',
                                border: '1px solid rgba(222, 185, 146, 0.2)',
                            }}
                        >
                            <p className="text-sm opacity-70">
                                Click asteroids to analyze • Drag to navigate • Scroll to zoom
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
