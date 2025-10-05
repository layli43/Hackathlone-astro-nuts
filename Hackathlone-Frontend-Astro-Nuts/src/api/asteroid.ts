import type { AxiosError } from 'axios';

import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL;
/**
 * Asteroid data structure
 */
interface Asteroid {
    id: string;
    name: string;
    nasa_jpl_url: string;
    is_potentially_hazardous_asteroid: boolean;
    close_approach_data: Array<{
        close_approach_date: string;
        relative_velocity: { kilometers_per_hour: string };
        miss_distance: { kilometers: string };
        orbiting_body: string;
    }>;
}

/**
 * Asteroid API response structure
 */
interface AsteroidApiResponse {
    data: Asteroid[] | null;
    error: string | null;
}

/**
 * Create axios instance
 */
const api = axios.create({
    baseURL,
    timeout: 8000,
    headers: {
        'Content-Type': 'application/json',
    },
});

/**
 * Fetch asteroids basic data from api
 */
export const getAsteroidsData = async (date: string): Promise<AsteroidApiResponse> => {
    try {
        const response = await api.get(`/asteroids/${date}`);
        return {
            data: response.data,
            error: null,
        };
    } catch (e) {
        const error = e as AxiosError;

        if (error.response) {
            const msg =
                (error.response.data as any)?.detail || `Server Error (${error.response.status})`;
            return {
                data: null,
                error: msg,
            };
        } else if (error.request) {
            return {
                data: null,
                error: 'No response received from server',
            };
        } else {
            return {
                data: null,
                error: error.message,
            };
        }
    }
};
