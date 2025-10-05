# 🚀 NASA NEO Asteroid Data Normalization

This Python script provides functionality to normalize Near-Earth Object (NEO) asteroid data retrieved from NASA's [NEO API](https://api.nasa.gov/).

The data is flattened and cleaned for easier downstream analysis or storage (e.g. in databases or CSV files).

---

## 📜 Contents

- [`normalize_asteroid_data`](#normalize_asteroid_data)
- [`normalize_multiple_asteroids`](#normalize_multiple_asteroids)
- [Sample Input Data](#sample-input-data)
- [Usage Example](#usage-example)
- [Sample Output](#sample-output)

---

## `normalize_asteroid_data`

```python
def normalize_asteroid_data(raw_data: dict) -> dict
