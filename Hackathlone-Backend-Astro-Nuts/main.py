import os
from typing import Dict, Any, List
from openai import OpenAI
from dotenv import load_dotenv
import json 
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import uvicorn
from normalize import normalize_asteroids, get_all_asteroid_ids, get_all_asteroids_normalized
import datetime
import sqlite3
import requests

# Visualization imports
import base64
from io import BytesIO
from matplotlib.figure import Figure
import matplotlib.pyplot as plt
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots

# Load environment variables
load_dotenv()
API_KEY = os.getenv("API_KEY")
OPEN_AI_KEY = os.getenv("OPEN_AI_KEY")

# Initialize OpenAI client
client = OpenAI(api_key=OPEN_AI_KEY)

# Initialize FastAPI app
app = FastAPI(title="NASA NEO Data Normalizer")

# ============================================================================
# CONFIGURE CORS
# ============================================================================
origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Date configurations
DATE = datetime.date.today().strftime('%Y-%m-%d')
START_DATE = datetime.date.today().strftime("%Y-%m-%d")
END_DATE = (datetime.date.today() + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
URL = f"https://api.nasa.gov/neo/rest/v1/feed?start_date={START_DATE}&end_date={END_DATE}&api_key={API_KEY}"

# Database connection
conn = sqlite3.connect("asteroids.db", check_same_thread=False)
cur = conn.cursor()

# ============================================================================
# PYDANTIC MODELS FOR REQUEST VALIDATION
# ============================================================================
class ReportRequest(BaseModel):
    asteroidIds: List[str]


# ============================================================================
# VISUALIZATION HELPER FUNCTIONS
# ============================================================================

def create_matplotlib_chart_base64(asteroids_data: List[Dict]) -> str:
    """
    Create a matplotlib chart showing asteroid size distribution by ranges
    Groups asteroids into size categories to avoid clutter
    """
    # Extract diameters
    diameters = []
    hazardous_status = []
    
    for a in asteroids_data:
        diameter = None
        if 'estimated_diameter' in a:
            if 'kilometers' in a['estimated_diameter']:
                diameter = a['estimated_diameter']['kilometers'].get('estimated_diameter_max', 0)
        if diameter is None:
            diameter = a.get('estimated_diameter_km_max', 0)
        diameters.append(diameter)
        hazardous_status.append(a.get('is_potentially_hazardous_asteroid', False))
    
    # Define size ranges (in km)
    ranges = [
        (0, 0.05, 'Tiny\n(0-0.05 km)'),
        (0.05, 0.1, 'Small\n(0.05-0.1 km)'),
        (0.1, 0.3, 'Medium\n(0.1-0.3 km)'),
        (0.3, 0.5, 'Large\n(0.3-0.5 km)'),
        (0.5, 1.0, 'Very Large\n(0.5-1.0 km)'),
        (1.0, float('inf'), 'Enormous\n(>1.0 km)')
    ]
    
    # Count asteroids in each range
    range_counts_hazardous = []
    range_counts_safe = []
    range_labels = []
    
    for min_size, max_size, label in ranges:
        hazardous_count = sum(1 for d, h in zip(diameters, hazardous_status) 
                             if min_size <= d < max_size and h)
        safe_count = sum(1 for d, h in zip(diameters, hazardous_status) 
                        if min_size <= d < max_size and not h)
        
        # Only include ranges with asteroids
        if hazardous_count > 0 or safe_count > 0:
            range_counts_hazardous.append(hazardous_count)
            range_counts_safe.append(safe_count)
            range_labels.append(label)
    
    # Create stacked horizontal bar chart
    fig = Figure(figsize=(10, 6))
    ax = fig.subplots()
    
    y_pos = range(len(range_labels))
    
    # Plot bars
    ax.barh(y_pos, range_counts_safe, color='#1BA098', label='Non-Hazardous')
    ax.barh(y_pos, range_counts_hazardous, left=range_counts_safe, 
            color='#DC143C', label='Potentially Hazardous')
    
    ax.set_yticks(y_pos)
    ax.set_yticklabels(range_labels, fontsize=10)
    ax.set_xlabel('Number of Asteroids', fontsize=12)
    ax.set_title('Asteroid Size Distribution by Category', fontsize=14, fontweight='bold')
    ax.legend(loc='upper right')
    ax.grid(axis='x', alpha=0.3)
    
    # Add count labels on bars
    for i, (safe, hazard) in enumerate(zip(range_counts_safe, range_counts_hazardous)):
        total = safe + hazard
        if total > 0:
            ax.text(total + 0.5, i, str(total), va='center', fontsize=9, fontweight='bold')
    
    # Save to base64
    buf = BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight', dpi=100)
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('ascii')
    buf.close()
    
    return f'<img src="data:image/png;base64,{img_base64}" style="max-width: 100%; height: auto;"/>'


def create_plotly_risk_matrix(asteroids_data: List[Dict]) -> str:
    """
    Create interactive Plotly scatter plot showing risk assessment
    Returns HTML string with embedded JavaScript
    """
    # Extract data
    names = []
    velocities = []
    distances = []
    diameters = []
    hazardous = []
    
    for a in asteroids_data:
        names.append(a.get('name', 'Unknown'))
        
        # Velocity
        velocity = None
        if 'close_approach_data' in a and len(a['close_approach_data']) > 0:
            velocity = float(a['close_approach_data'][0].get('relative_velocity', {}).get('kilometers_per_second', 0))
        velocities.append(velocity or a.get('relative_velocity_km_s', 0))
        
        # Distance
        distance = None
        if 'close_approach_data' in a and len(a['close_approach_data']) > 0:
            distance = float(a['close_approach_data'][0].get('miss_distance', {}).get('astronomical', 0))
        distances.append(distance or a.get('miss_distance_au', 0))
        
        # Diameter
        diameter = None
        if 'estimated_diameter' in a:
            if 'kilometers' in a['estimated_diameter']:
                diameter = a['estimated_diameter']['kilometers'].get('estimated_diameter_max', 0)
        diameters.append(diameter or a.get('estimated_diameter_km_max', 0))
        
        hazardous.append(a.get('is_potentially_hazardous_asteroid', False))
    
    # Create Plotly figure
    fig = go.Figure()
    
    # Add traces
    colors = ['#DC143C' if h else '#1BA098' for h in hazardous]
    
    fig.add_trace(go.Scatter(
        x=distances,
        y=velocities,
        mode='markers',
        marker=dict(
            size=[d * 50 for d in diameters],  # Scale diameter for visibility
            color=colors,
            line=dict(width=2, color='white'),
            opacity=0.7
        ),
        text=[f"{name}<br>Diameter: {d:.3f} km<br>Distance: {dist:.4f} AU<br>Velocity: {vel:.2f} km/s" 
              for name, d, dist, vel in zip(names, diameters, distances, velocities)],
        hoverinfo='text',
        name='Asteroids'
    ))
    
    fig.update_layout(
        title='Asteroid Risk Assessment Matrix',
        xaxis_title='Miss Distance (AU)',
        yaxis_title='Relative Velocity (km/s)',
        plot_bgcolor='#F8F9FA',
        paper_bgcolor='white',
        font=dict(family='Arial, sans-serif', size=12),
        hovermode='closest'
    )
    
    # Convert to HTML div (no full page, just the plot)
    return fig.to_html(full_html=False, include_plotlyjs='cdn')


def create_danger_distribution_chart(asteroids_data: List[Dict]) -> str:
    """
    Create a pie chart showing hazard distribution using Plotly
    """
    hazardous_count = sum(1 for a in asteroids_data if a.get('is_potentially_hazardous_asteroid', False))
    non_hazardous_count = len(asteroids_data) - hazardous_count
    
    fig = go.Figure(data=[go.Pie(
        labels=['Potentially Hazardous', 'Non-Hazardous'],
        values=[hazardous_count, non_hazardous_count],
        marker=dict(colors=['#DC143C', '#1BA098']),
        hole=0.4,
        textinfo='label+percent',
        textfont=dict(size=14)
    )])
    
    fig.update_layout(
        title='Hazard Classification Distribution',
        plot_bgcolor='white',
        paper_bgcolor='white',
        font=dict(family='Arial, sans-serif')
    )
    
    return fig.to_html(full_html=False, include_plotlyjs='cdn')


# ============================================================================
# ASTEROID DATABASE ENDPOINTS
# ============================================================================

@app.get("/database/asteroids")
def get_asteroids_from_db():
    """
    Get all asteroids from database in normalized format
    Returns: List of all asteroids with complete data
    """
    return get_all_asteroids_normalized()


@app.get("/database/asteroids/ids")
def get_all_ids():
    """
    Get list of all asteroid IDs in database
    Returns: JSON with array of asteroid IDs
    """
    return {"asteroid_ids": get_all_asteroid_ids()}


@app.get("/database/asteroids/{asteroid_id}")
def get_asteroid_by_id(asteroid_id: str):
    """
    Get a single asteroid by ID in normalized format
    Args:
        asteroid_id: The neo_reference_id of the asteroid
    Returns: Complete asteroid data in normalized format
    """
    result = normalize_asteroids(asteroid_id)
    
    if result is None:
        raise HTTPException(
            status_code=404, 
            detail=f"Asteroid with ID {asteroid_id} not found"
        )
    
    return json.loads(result)


# ============================================================================
# NASA API ENDPOINT (Legacy - for direct API fetching)
# ============================================================================

@app.get("/asteroids/{date}")
def get_asteroids_from_api(date: str):
    """
    Fetch asteroids directly from NASA API for a specific date
    This endpoint is for testing/comparison with database data
    """
    try:
        response = requests.get(URL)
        
        if response.status_code == 200:
            data = response.json()
            asteroids = data.get("near_earth_objects", {}).get(date, [])
            
            if not asteroids:
                raise HTTPException(
                    status_code=404, 
                    detail=f"No asteroids found for date {date}"
                )
            
            return asteroids
        else:
            raise HTTPException(
                status_code=response.status_code, 
                detail="Error fetching from NASA API"
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# AI ANALYSIS ENDPOINTS - WITH VISUALIZATIONS
# ============================================================================

@app.post("/ai/report")
async def generate_html_report(request: ReportRequest):
    """
    Generate HTML report with embedded matplotlib and Plotly visualizations
    """
    try:
        # Get asteroid data from database
        asteroids_data = []
        for asteroid_id in request.asteroidIds:
            result = normalize_asteroids(asteroid_id)
            if result:
                try:
                    asteroids_data.append(json.loads(result))
                except:
                    asteroids_data.append(result)
        
        if not asteroids_data:
            raise HTTPException(
                status_code=404,
                detail="No asteroids found for provided IDs"
            )
        
        # Generate visualizations
        print("🎨 Generating visualizations...")
        matplotlib_chart = create_matplotlib_chart_base64(asteroids_data)
        plotly_risk_chart = create_plotly_risk_matrix(asteroids_data)
        plotly_danger_pie = create_danger_distribution_chart(asteroids_data)
        
        # Prepare asteroid summary
        asteroid_summary_list = []
        for a in asteroids_data:
            try:
                name = a.get('name', 'Unknown')
                
                diameter = None
                if 'estimated_diameter' in a and 'kilometers' in a['estimated_diameter']:
                    diameter = a['estimated_diameter']['kilometers'].get('estimated_diameter_max', 0)
                
                velocity = None
                if 'close_approach_data' in a and len(a['close_approach_data']) > 0:
                    velocity = a['close_approach_data'][0].get('relative_velocity', {}).get('kilometers_per_second', 0)
                
                distance = None
                if 'close_approach_data' in a and len(a['close_approach_data']) > 0:
                    distance = a['close_approach_data'][0].get('miss_distance', {}).get('astronomical', 0)
                
                is_hazardous = a.get('is_potentially_hazardous_asteroid', False)
                
                approach_date = None
                if 'close_approach_data' in a and len(a['close_approach_data']) > 0:
                    approach_date = a['close_approach_data'][0].get('close_approach_date_full', 'Unknown')
                
                summary_parts = [f"- {name}"]
                if diameter:
                    summary_parts.append(f"{diameter:.2f} km diameter")
                if velocity:
                    summary_parts.append(f"{velocity:.2f} km/s velocity")
                if distance:
                    summary_parts.append(f"Miss distance: {distance:.4f} AU")
                summary_parts.append(f"Potentially hazardous: {is_hazardous}")
                if approach_date:
                    summary_parts.append(f"Close approach: {approach_date}")
                
                asteroid_summary_list.append(", ".join(summary_parts))
                
            except Exception as e:
                print(f"Error processing asteroid: {e}")
                asteroid_summary_list.append(f"- {json.dumps(a, indent=2)}")
        
        asteroid_summary = "\n".join(asteroid_summary_list)
        
        # Call OpenAI with visualization placeholders
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": """You are an expert asteroid impact analyst. Generate a professional HTML report.

**IMPORTANT: Use these EXACT placeholder strings where visualizations should appear:**
- {{MATPLOTLIB_SIZE_CHART}} - for the asteroid size distribution chart (grouped by ranges)
- {{PLOTLY_RISK_MATRIX}} - for the interactive risk assessment scatter plot  
- {{PLOTLY_DANGER_PIE}} - for the hazard distribution pie chart

These will be replaced with actual visualizations. Do NOT generate your own charts or ASCII art.

**STYLING:**
- Clean, professional design with white/light gray backgrounds
- Dark text (#1A1A1A) on light backgrounds
- Accent colors: Teal (#1BA098), Red (#DC143C) for hazards
- Modern sans-serif fonts
- Subtle shadows and borders only
- Responsive layout

**CONTENT STRUCTURE:**
1. Executive Summary with key statistics
2. **INSERT {{PLOTLY_DANGER_PIE}} here** - Hazard Overview
3. **INSERT {{MATPLOTLIB_SIZE_CHART}} here** - Size Distribution by Category
4. **INSERT {{PLOTLY_RISK_MATRIX}} here** - Risk Assessment Matrix
5. Individual Asteroid Analysis  
6. Impact Scenarios (if applicable)
7. Specific Mitigation Strategies based on asteroid characteristics
8. Recommendations

Use specific technical details. Avoid vague language."""
                },
                {
                    "role": "user",
                    "content": f"""Generate a complete HTML asteroid impact assessment report.

**Asteroids to analyze:**
{asteroid_summary}

Remember to include the visualization placeholders:
- {{{{MATPLOTLIB_SIZE_CHART}}}}
- {{{{PLOTLY_RISK_MATRIX}}}}
- {{{{PLOTLY_DANGER_PIE}}}}

Start with <!DOCTYPE html>"""
                }
            ],
            max_tokens=4000,
            temperature=0.7
        )
        
        html_report = response.choices[0].message.content
        
        # Replace placeholders with actual visualizations
        html_report = html_report.replace('{{MATPLOTLIB_SIZE_CHART}}', matplotlib_chart)
        html_report = html_report.replace('{{PLOTLY_RISK_MATRIX}}', plotly_risk_chart)
        html_report = html_report.replace('{{PLOTLY_DANGER_PIE}}', plotly_danger_pie)
        
        print("✅ Report generated with visualizations")
        
        return HTMLResponse(content=html_report)
        
    except Exception as e:
        import traceback
        error_detail = f"Failed to generate report: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=error_detail)


# ============================================================================
# HEALTH CHECK
# ============================================================================

@app.get("/")
def root():
    """
    Root endpoint - API health check
    """
    return {
        "status": "online",
        "api_name": "NASA NEO Data Normalizer with Visualizations",
        "endpoints": {
            "database": [
                "/database/asteroids",
                "/database/asteroids/ids",
                "/database/asteroids/{asteroid_id}"
            ],
            "ai_analysis": [
                "/ai/report (POST)"
            ],
            "nasa_api": [
                "/asteroids/{date}"
            ]
        }
    }


# ============================================================================
# RUN SERVER
# ============================================================================

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=5000,
        reload=True
    )
