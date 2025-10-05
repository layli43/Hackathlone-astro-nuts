import sqlite3
import requests
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta

# Load API key from .env file
load_dotenv()
API_KEY = os.getenv("API_KEY")

# Use the FEED endpoint for latest NEOs
BASE_URL = f"https://api.nasa.gov/neo/rest/v1/feed?api_key={API_KEY}"

# Connect to SQLite database
conn = sqlite3.connect("asteroids.db")
cursor = conn.cursor()

# Create tables
cursor.execute("""
CREATE TABLE IF NOT EXISTS asteroids (
    neo_reference_id TEXT PRIMARY KEY,
    name TEXT,
    nasa_jpl_url TEXT,
    absolute_magnitude_h REAL,
    is_potentially_hazardous INTEGER,
    is_sentry_object INTEGER
);
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS asteroid_diameters (
    asteroid_id TEXT,
    unit TEXT,
    diameter_min REAL,
    diameter_max REAL,
    PRIMARY KEY (asteroid_id, unit),
    FOREIGN KEY (asteroid_id) REFERENCES asteroids(neo_reference_id)
);
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS close_approaches (
    asteroid_id TEXT PRIMARY KEY,
    close_approach_date TEXT,
    close_approach_date_full TEXT,
    epoch_date_close_approach INTEGER,
    velocity_km_s REAL,
    velocity_km_h REAL,
    velocity_mi_h REAL,
    miss_distance_astronomical REAL,
    miss_distance_lunar REAL,
    miss_distance_km REAL,
    miss_distance_miles REAL,
    orbiting_body TEXT,
    FOREIGN KEY (asteroid_id) REFERENCES asteroids(neo_reference_id)
);
""")

# Fetch the last 7 days of asteroid data
end_date = datetime.today().date()
start_date = end_date - timedelta(days=7)

response = requests.get(
    f"{BASE_URL}&start_date={start_date}&end_date={end_date}"
)
data = response.json()

if "near_earth_objects" not in data:
    print("Error from NASA API:", data)
    conn.close()
    exit()

inserted_count = 0

for date, asteroids in data["near_earth_objects"].items():
    for asteroid in asteroids:
        neo_id = asteroid["neo_reference_id"]

        # Insert asteroid basic info
        cursor.execute("""
        INSERT OR REPLACE INTO asteroids
        (neo_reference_id, name, nasa_jpl_url, absolute_magnitude_h, is_potentially_hazardous, is_sentry_object)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (
            neo_id,
            asteroid["name"],
            asteroid["nasa_jpl_url"],
            asteroid["absolute_magnitude_h"],
            int(asteroid["is_potentially_hazardous_asteroid"]),
            int(asteroid.get("is_sentry_object", False))
        ))

        # Insert diameter data (will overwrite because PRIMARY KEY is asteroid_id)
        for unit, values in asteroid["estimated_diameter"].items():
            cursor.execute("""
            INSERT OR REPLACE INTO asteroid_diameters
            (asteroid_id, unit, diameter_min, diameter_max)
            VALUES (?, ?, ?, ?)
            """, (
                neo_id,
                unit,
                values["estimated_diameter_min"],
                values["estimated_diameter_max"]
            ))

        # Insert close approach data (also overwrites since asteroid_id is PRIMARY KEY)
        for approach in asteroid["close_approach_data"]:
            cursor.execute("""
            INSERT OR REPLACE INTO close_approaches
            (asteroid_id, close_approach_date, close_approach_date_full,
            epoch_date_close_approach, velocity_km_s, velocity_km_h, velocity_mi_h,
            miss_distance_astronomical, miss_distance_lunar, miss_distance_km, miss_distance_miles,
            orbiting_body)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                neo_id,
                approach["close_approach_date"],
                approach.get("close_approach_date_full"),
                approach.get("epoch_date_close_approach"),
                float(approach["relative_velocity"]["kilometers_per_second"]),
                float(approach["relative_velocity"]["kilometers_per_hour"]),
                float(approach["relative_velocity"]["miles_per_hour"]),
                float(approach["miss_distance"]["astronomical"]),
                float(approach["miss_distance"]["lunar"]),
                float(approach["miss_distance"]["kilometers"]),
                float(approach["miss_distance"]["miles"]),
                approach["orbiting_body"]
            ))

        inserted_count += 1

print(f"Inserted {inserted_count} asteroids from {start_date} to {end_date}")

# Commit and close
conn.commit()

conn.close()
print("\nAll asteroid data inserted successfully (using FEED API).")
