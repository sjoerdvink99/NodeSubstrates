"""Generate a synthetic insurance fraud network dataset."""

import json
import random
from datetime import datetime, timedelta
from pathlib import Path

random.seed(42)

# Output path
OUTPUT_PATH = Path(__file__).parent.parent / "data" / "insurance-fraud-data.json"

# Generate accidents (40)
accidents = []
base_date = datetime(2021, 10, 1)
for i in range(40):
    acc_id = i
    start_date = base_date + timedelta(days=random.randint(0, 400))
    end_date = start_date + timedelta(days=random.randint(5, 60))
    accidents.append({
        "id": acc_id,
        "type": "Accident",
        "enter": [start_date.strftime("%Y-%m-%d")],
        "exit": [end_date.strftime("%Y-%m-%d")],
        "info": f"Accident {i+1}"
    })

node_id = 40

# Generate cars (100), each involved in 1-3 accidents
cars = []
for i in range(100):
    car_id = node_id
    node_id += 1
    plate = f"{''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ', k=2))} {random.randint(1000, 9999)}"
    cars.append({
        "id": car_id,
        "type": "Car", 
        "enter": [],
        "exit": [],
        "info": plate
    })

# Generate lawyers (50)
lawyers = []
first_names = ["James", "Sarah", "Michael", "Emily", "David", "Jessica", "Robert", "Ashley", "William", "Amanda",
               "John", "Jennifer", "Thomas", "Elizabeth", "Charles", "Nicole", "Daniel", "Samantha", "Matthew", "Lauren"]
last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Martinez", "Wilson",
              "Anderson", "Taylor", "Thomas", "Moore", "Jackson", "Martin", "Lee", "Thompson", "White", "Harris"]

for i in range(50):
    lawyer_id = node_id
    node_id += 1
    name = f"{random.choice(first_names)} {random.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZ')}. {random.choice(last_names)}".upper()
    lawyers.append({
        "id": lawyer_id,
        "type": "Lawyer",
        "enter": [],
        "exit": [],
        "info": {"name": name, "role": "Lawyer"}
    })

# Generate doctors (30)
doctors = []
for i in range(30):
    doc_id = node_id
    node_id += 1
    name = f"Dr. {random.choice(first_names)} {random.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZ')}. {random.choice(last_names)}".upper()
    doctors.append({
        "id": doc_id,
        "type": "Doctor",
        "enter": [],
        "exit": [],
        "info": {"name": name, "role": "Doctor"}
    })

# Generate participants (300) - drivers, passengers, witnesses
participants = []
roles = ["Driver", "Passenger", "Witness"]
for i in range(300):
    part_id = node_id
    node_id += 1
    name = f"{random.choice(first_names)} {random.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZ')}. {random.choice(last_names)}".upper()
    role = random.choice(roles)
    participants.append({
        "id": part_id,
        "type": "Participant",
        "enter": [],
        "exit": [],
        "info": {"name": name, "role": role}
    })

# Create edges
edges = []

# Each accident involves 1-4 cars
for acc in accidents:
    num_cars = random.randint(1, 4)
    involved_cars = random.sample(cars, min(num_cars, len(cars)))
    for car in involved_cars:
        edges.append({"source": acc["id"], "target": car["id"], "type": "involves"})
        car["enter"].append(acc["enter"][0])
        car["exit"].append(acc["exit"][0])

# Each car has 1-4 participants
for car in cars:
    if car["enter"]:  # Only if car is involved in accidents
        num_parts = random.randint(1, 4)
        for _ in range(num_parts):
            part = random.choice(participants)
            role = part["info"]["role"]
            if role == "Driver":
                edges.append({"source": car["id"], "target": part["id"], "type": "drives"})
            elif role == "Passenger":
                edges.append({"source": car["id"], "target": part["id"], "type": "isPassenger"})
            else:
                edges.append({"source": car["id"], "target": part["id"], "type": "witnesses"})
            if car["enter"]:
                part["enter"].extend(car["enter"][:1])
                part["exit"].extend(car["exit"][:1])

# Some participants use lawyers (fraudulent connections)
fraud_lawyers = random.sample(lawyers, 10)  # 10 lawyers involved in many cases
for part in participants:
    if random.random() < 0.4:  # 40% use lawyer
        lawyer = random.choice(fraud_lawyers) if random.random() < 0.6 else random.choice(lawyers)
        edges.append({"source": lawyer["id"], "target": part["id"], "type": "represents"})
        if part["enter"]:
            lawyer["enter"].extend(part["enter"][:1])
            lawyer["exit"].extend(part["exit"][:1])

# Some participants visit doctors
fraud_doctors = random.sample(doctors, 5)  # 5 doctors involved in many cases
for part in participants:
    if random.random() < 0.3:  # 30% visit doctor
        doctor = random.choice(fraud_doctors) if random.random() < 0.7 else random.choice(doctors)
        edges.append({"source": doctor["id"], "target": part["id"], "type": "heals"})
        if part["enter"]:
            doctor["enter"].extend(part["enter"][:1])
            doctor["exit"].extend(part["exit"][:1])

# Create the NetworkX-compatible JSON
all_nodes = accidents + cars + lawyers + doctors + participants

# Convert to node-link format (NetworkX uses "links" key)
data = {
    "directed": True,
    "multigraph": False,
    "graph": {},
    "nodes": all_nodes,
    "links": edges  # NetworkX node_link_graph expects "links" by default
}

# Save to file
with open(OUTPUT_PATH, "w") as f:
    json.dump(data, f, indent=2)

print(f"Created insurance fraud network at {OUTPUT_PATH}:")
print(f"  Nodes: {len(all_nodes)}")
print(f"  Edges: {len(edges)}")
print(f"  Accidents: {len(accidents)}")
print(f"  Cars: {len(cars)}")
print(f"  Lawyers: {len(lawyers)}")
print(f"  Doctors: {len(doctors)}")
print(f"  Participants: {len(participants)}")
