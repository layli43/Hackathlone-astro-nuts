import json
import sqlite3

def normalize_asteroids(asteroid_id):
    """
    Takes an asteroid ID and queries the database to return 
    a single asteroid dict in the specified format
    """
    conn = sqlite3.connect("asteroids.db")
    cur = conn.cursor()
    
    # Query main asteroid data with close approach
    query = """
    SELECT
        A.neo_reference_id AS id,
        A.name,
        A.nasa_jpl_url,
        A.absolute_magnitude_h,
        A.is_potentially_hazardous,
        A.is_sentry_object,
        C.close_approach_date,
        C.close_approach_date_full,
        C.epoch_date_close_approach,
        C.velocity_km_s,
        C.velocity_km_h,
        C.velocity_mi_h,
        C.miss_distance_astronomical,
        C.miss_distance_lunar,
        C.miss_distance_km,
        C.miss_distance_miles,
        C.orbiting_body
    FROM asteroids A
    LEFT JOIN close_approaches C ON A.neo_reference_id = C.asteroid_id
    WHERE A.neo_reference_id = ?
    """
    
    cur.execute(query, (asteroid_id,))
    row = cur.fetchone()
    
    if not row:
        conn.close()
        return None
    
    # Convert to dict
    columns = [desc[0] for desc in cur.description]
    asteroid_data = dict(zip(columns, row))
    
    # Query diameter data for this asteroid
    diameter_query = """
    SELECT unit, diameter_min, diameter_max
    FROM asteroid_diameters
    WHERE asteroid_id = ?
    """
    cur.execute(diameter_query, (asteroid_id,))
    diameter_rows = cur.fetchall()
    
    # Organize diameter data by unit
    diameters = {}
    for unit, d_min, d_max in diameter_rows:
        diameters[unit] = {'min': d_min, 'max': d_max}
    
    conn.close()
    
    # Build the normalized output
    normalized = {
        'id': asteroid_data['id'],
        'name': asteroid_data['name'],
        'nasa_jpl_url': asteroid_data['nasa_jpl_url'],
        'absolute_magnitude_h': asteroid_data['absolute_magnitude_h'],
        'estimated_diameter_km_min': diameters.get('kilometers', {}).get('min', 0),
        'estimated_diameter_km_max': diameters.get('kilometers', {}).get('max', 0),
        'estimated_diameter_m_min': diameters.get('meters', {}).get('min', 0),
        'estimated_diameter_m_max': diameters.get('meters', {}).get('max', 0),
        'estimated_diameter_mi_min': diameters.get('miles', {}).get('min', 0),
        'estimated_diameter_mi_max': diameters.get('miles', {}).get('max', 0),
        'estimated_diameter_ft_min': diameters.get('feet', {}).get('min', 0),
        'estimated_diameter_ft_max': diameters.get('feet', {}).get('max', 0),
        'is_potentially_hazardous_asteroid': bool(asteroid_data['is_potentially_hazardous']),
        'is_sentry_object': bool(asteroid_data['is_sentry_object']),
        'close_approach_date': asteroid_data['close_approach_date'],
        'close_approach_date_full': asteroid_data['close_approach_date_full'],
        'epoch_date_close_approach': asteroid_data['epoch_date_close_approach'],
        'relative_velocity_km_s': asteroid_data['velocity_km_s'],
        'relative_velocity_km_h': asteroid_data['velocity_km_h'],
        'relative_velocity_mph': asteroid_data['velocity_mi_h'],
        'miss_distance_au': asteroid_data['miss_distance_astronomical'],
        'miss_distance_lunar': asteroid_data['miss_distance_lunar'],
        'miss_distance_km': asteroid_data['miss_distance_km'],
        'miss_distance_mi': asteroid_data['miss_distance_miles'],
        'orbiting_body': asteroid_data['orbiting_body']
    }
    
    return json.dumps(normalized, indent=2)


def get_all_asteroid_ids():
    """
    Returns a list of all asteroid IDs in the database
    """
    conn = sqlite3.connect("asteroids.db")
    cur = conn.cursor()
    
    cur.execute("SELECT neo_reference_id FROM asteroids")
    ids = [row[0] for row in cur.fetchall()]
    
    conn.close()
    return ids


def get_all_asteroids_normalized():
    """
    Returns all asteroids in normalized format
    """
    ids = get_all_asteroid_ids()
    all_asteroids = []
    
    for asteroid_id in ids:
        normalized_json = normalize_asteroids(asteroid_id)
        if normalized_json:
            all_asteroids.append(json.loads(normalized_json))
    
    return all_asteroids