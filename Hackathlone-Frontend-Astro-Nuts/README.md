Asteroid Tracking System - Developer Notes
Hey team! This is our 3D asteroid visualization dashboard. If you're jumping into this codebase, here's what you need to know to get started and avoid the pitfalls I've already hit.

What This Thing Does
We built a React app that shows asteroids floating around Earth in 3D space. Think of it like a mission control dashboard where you can click on asteroids to see if they're going to kill us all. The whole thing runs in the browser using Three.js for the 3D stuff and Tailwind for making it look decent.

Running It Locally
bash
npm install
npm run dev
If you get weird esbuild errors (and you probably will), install this specific version:

bash
npm install esbuild@0.23.1 --save-dev
Trust me on this one. The newer esbuild versions break Vite for some reason.

How The Code Is Organized
Main Components
App.tsx - This is where everything lives. Yeah, it's a big file (700+ lines). I know we should break it up, but it works and I didn't want to over-engineer it during the hackathon.

The 3D Scene Setup - Around lines 200-300, we create the Three.js scene, camera, and renderer. The tricky part is getting the camera positioned right so you can actually see stuff.

Space Background - The createStarField() function generates 15,000 random stars. It's procedural, so it looks different each time but consistently random if that makes sense.

Earth with Continents - createEarthWithCountries() draws a blue sphere with green continent shapes. It's super basic but works. We use a canvas to draw the continents and slap it on the sphere as a texture.

Data Structure
The asteroid data is hardcoded in ASTEROID_DATA array. Each asteroid has:

Basic info (name, size, velocity)

NASA data (Torino scale, hazard classification)

Impact calculations (energy, crater size, risk zones)

Importance scoring (1-10 for filtering)

Common Issues You'll Hit
1. Nothing Shows Up (Black Screen)
This happens when Three.js objects are positioned wrong or the camera is looking at nothing.

Debug steps:

Check console logs - I added several console.log statements

Verify camera position: should be around (25, 10, 25)

Make sure lighting exists - without lights, everything is black

Object scaling might be wrong - asteroids could be too small or too big

2. JSX Errors with Special Characters
If you see errors about > or < characters in JSX, escape them:

jsx
// Wrong
<span>Asteroid (>10km)</span>

// Right  
<span>Asteroid (&gt;10km)</span>
3. Asteroids Too Big/Small
The scaling algorithm is in the main useEffect. It's logarithmic for large asteroids because some are 38km wide and would fill the entire screen.

javascript
if (asteroid.estimated_diameter_km_max > 10) {
  size = Math.min(Math.log(asteroid.estimated_diameter_km_max) * 0.8, 5);
}
4. Animation Stops Working
React StrictMode runs effects twice in development, which breaks Three.js animation loops. The cleanup function might be canceling animations too early.

Performance Notes
We're rendering 15,000 star particles - might be too much on slower devices

The orbital animation recalculates positions every frame

Each asteroid is a separate mesh with its own geometry

Earth has two layers (base sphere + continent texture)

If it's slow, reduce the star count in createStarField() or implement LOD (level of detail) for asteroids.

Working with the Data
To add new asteroids, just push to the ASTEROID_DATA array. Make sure you include all the properties or TypeScript will complain. The importance_score determines which asteroids show first when using the slider.

The Torino Scale (0-10) is NASA's actual asteroid risk assessment. 0 = no risk, 10 = certain global catastrophe.

Three.js Gotchas
Always dispose of geometries and materials in the cleanup function

Camera far plane is set to 10000 to accommodate large scenes

We use SRGBColorSpace to fix color rendering issues

Orbital paths are created as ring geometries, not actual orbital mechanics

Future Improvements
Break this monster component into smaller pieces

Add actual orbital mechanics calculations

Implement real-time NASA API integration

Add texture loading for better Earth visuals

Move hardcoded data to JSON files

Debugging Tips
The console logs will tell you:

How many objects were created

Camera position

Asteroid positions and sizes

Any Three.js errors

If something's broken, check the browser console first. Most issues are positioning or scaling problems.