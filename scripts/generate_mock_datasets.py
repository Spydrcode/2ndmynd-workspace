"""
Generate multiple mock HVAC business datasets for testing
Creates varied scenarios: growing business, seasonal heavy, steady operations, etc.
"""
import csv
import random
import datetime
import zipfile
import os
from pathlib import Path

# Configuration
YEAR = 2025
START_DATE = datetime.date(YEAR, 1, 1)
END_DATE = datetime.date(YEAR, 12, 31)

# Business Info
SERVICE_AREAS = [
    "Apache Junction, AZ", "Mesa, AZ", "Gilbert, AZ", "Chandler, AZ", 
    "Queen Creek, AZ", "San Tan Valley, AZ", "Gold Canyon, AZ", "Scottsdale, AZ"
]
TECHNICIANS = ["Miguel", "Armando", "Steve", "David", "Junior"]
LABOR_RATE = 125.00  # Hourly rate

# Materials & Services Database (Cost, Price)
MATERIALS = {
    "R-410A Refrigerant (lb)": (15.00, 65.00),
    "Run Capacitor 35/5": (12.00, 145.00),
    "Contactor 1-Pole": (15.00, 125.00),
    "Hard Start Kit": (25.00, 185.00),
    "Trane XR14 Condenser (3 Ton)": (1800.00, 3200.00),
    "Heat Pump System (Complete)": (3500.00, 6500.00),
    "Honeywell T6 Pro Thermostat": (60.00, 250.00),
    "Furnace Control Board": (90.00, 450.00),
    "Fan Motor (Condenser)": (85.00, 425.00),
    "UVC Air Scrubber": (200.00, 850.00),
    "Filter 20x20x1": (5.00, 25.00),
    "Drain Line Flush Kit": (2.00, 45.00)
}

JOB_TYPES = {
    "AC Repair": ["R-410A Refrigerant (lb)", "Run Capacitor 35/5", "Contactor 1-Pole", "Fan Motor (Condenser)"],
    "AC Installation": ["Trane XR14 Condenser (3 Ton)", "Honeywell T6 Pro Thermostat"],
    "Heating Repair": ["Furnace Control Board", "Honeywell T6 Pro Thermostat"],
    "Heat Pump Install": ["Heat Pump System (Complete)", "Honeywell T6 Pro Thermostat"],
    "Maintenance/Tune-up": ["Filter 20x20x1", "Drain Line Flush Kit", "R-410A Refrigerant (lb)"],
    "Air Quality Install": ["UVC Air Scrubber"]
}

# Seasonal Weights (Month 1-12)
SEASONAL_MULTIPLIER = {
    1: 0.8, 2: 0.7, 3: 0.9, 4: 1.2, 5: 1.8, 6: 2.5, 
    7: 2.8, 8: 2.5, 9: 1.5, 10: 1.0, 11: 0.8, 12: 0.9
}

# Helper Data
FIRST_NAMES = ["John", "Jane", "Robert", "Emily", "Michael", "Sarah", "David", "Jennifer", "James", "Lisa",
               "William", "Patricia", "Richard", "Linda", "Joseph", "Barbara", "Thomas", "Elizabeth", "Charles", "Mary"]
LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
              "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin"]

def random_phone():
    return f"(480) {random.randint(200,999)}-{random.randint(1000,9999)}"

def write_csv(filename, headers, data):
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(data)

def generate_dataset(scenario_name, volume_multiplier=1.0, close_rate=0.8, payment_delay_avg=30, seasonal_variation=1.0):
    """
    Generate a complete dataset with specified characteristics
    
    Args:
        scenario_name: Name for this scenario
        volume_multiplier: Scale daily volume (0.5 = half volume, 2.0 = double)
        close_rate: Quote acceptance rate (0.0 to 1.0)
        payment_delay_avg: Average days to payment
        seasonal_variation: Multiplier for seasonal swings (0.5 = muted, 1.5 = exaggerated)
    """
    print(f"Generating {scenario_name}...")
    
    # Data Storage
    customers = []
    quotes = []
    jobs = []
    schedule = []
    invoices = []
    invoice_items = []
    
    customer_id_counter = 1000
    quote_id_counter = 5000
    job_id_counter = 8000
    invoice_id_counter = 20000
    
    current_date = START_DATE
    while current_date <= END_DATE:
        month = current_date.month
        day_of_week = current_date.weekday() # 0=Mon, 6=Sun
        
        # Base jobs per day (random fluctuation)
        daily_volume = random.randint(2, 6)
        
        # Apply volume multiplier and seasonality
        seasonal_factor = 1.0 + (SEASONAL_MULTIPLIER[month] - 1.0) * seasonal_variation
        daily_volume = int(daily_volume * volume_multiplier * seasonal_factor)
        
        # Reduce volume on weekends
        if day_of_week == 5: # Saturday
            daily_volume = int(daily_volume * 0.5)
        elif day_of_week == 6: # Sunday
            daily_volume = 0
            if random.random() > 0.95: daily_volume = 1
            
        for _ in range(daily_volume):
            # 1. Create Customer
            c_id = customer_id_counter
            c_fname = random.choice(FIRST_NAMES)
            c_lname = random.choice(LAST_NAMES)
            c_name = f"{c_fname} {c_lname}"
            c_addr = f"{random.randint(100, 9999)} E {random.choice(['Broadway', 'Main', 'Apache', 'Southern', 'University'])} Trl, {random.choice(SERVICE_AREAS)}"
            customers.append([c_id, c_name, c_addr, random_phone(), f"{c_fname.lower()}.{c_lname.lower()}@example.com"])
            customer_id_counter += 1

            # 2. Determine Job Type based on Season
            if month in [5, 6, 7, 8, 9]:
                j_type = random.choices(["AC Repair", "AC Installation", "Maintenance/Tune-up"], weights=[60, 10, 30])[0]
            elif month in [11, 12, 1, 2]:
                j_type = random.choices(["Heating Repair", "Heat Pump Install", "Maintenance/Tune-up"], weights=[50, 15, 35])[0]
            else:
                j_type = random.choices(["Maintenance/Tune-up", "Air Quality Install", "AC Installation"], weights=[60, 10, 30])[0]

            # 3. Create Quote
            q_id = quote_id_counter
            q_status = "Accepted" if random.random() < close_rate else "Rejected"
            quotes.append([q_id, c_id, current_date, f"Quote for {j_type}", q_status])
            quote_id_counter += 1

            if q_status == "Accepted":
                # 4. Create Job
                j_id = job_id_counter
                tech = random.choice(TECHNICIANS)
                job_status = "Completed"
                jobs.append([j_id, q_id, c_id, j_type, job_status])
                
                # 5. Schedule (1-7 days after quote)
                job_date = current_date + datetime.timedelta(days=random.randint(1, 7))
                start_hour = random.randint(7, 16)
                duration = random.randint(1, 4)
                start_time = f"{job_date} {start_hour:02d}:00:00"
                end_time = f"{job_date} {start_hour+duration:02d}:00:00"
                schedule.append([j_id, tech, start_time, end_time])

                # 6. Invoice & Items
                inv_id = invoice_id_counter
                
                # Calculate costs
                labor_hours = duration
                labor_cost = labor_hours * LABOR_RATE
                
                # Add materials
                mat_total = 0
                job_cost = 0
                possible_parts = JOB_TYPES[j_type]
                num_parts = random.randint(1, min(3, len(possible_parts)))
                
                selected_parts = random.sample(possible_parts, num_parts)
                
                # Add Labor Line Item
                invoice_items.append([inv_id, "Labor", labor_hours, LABOR_RATE, labor_cost])
                
                for part in selected_parts:
                    cost, price = MATERIALS[part]
                    qty = 1
                    if part == "R-410A Refrigerant (lb)":
                        qty = random.randint(1, 5)
                    
                    line_total = price * qty
                    mat_total += line_total
                    job_cost += (cost * qty)
                    
                    invoice_items.append([inv_id, part, qty, price, line_total])

                subtotal = labor_cost + mat_total
                tax = round(subtotal * 0.081, 2) # ~8.1% AZ Tax
                total = subtotal + tax
                profit = (subtotal - (labor_hours * 40) - job_cost) # Assuming $40/hr tech wage cost

                # Payment timing varies by scenario
                payment_delay = max(0, int(random.gauss(payment_delay_avg, payment_delay_avg * 0.3)))
                payment_date = job_date + datetime.timedelta(days=payment_delay)
                payment_status = "Paid" if payment_date <= datetime.date(2025, 12, 31) else "Unpaid"
                
                invoices.append([inv_id, j_id, job_date, job_date + datetime.timedelta(days=30), subtotal, tax, total, profit, payment_status])
                
                job_id_counter += 1
                invoice_id_counter += 1

        current_date += datetime.timedelta(days=1)

    # Write to CSV
    output_dir = Path("tmp/mock_datasets")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    scenario_dir = output_dir / scenario_name
    scenario_dir.mkdir(exist_ok=True)
    
    write_csv(scenario_dir / "customers.csv", ["CustomerID", "Name", "Address", "Phone", "Email"], customers)
    write_csv(scenario_dir / "quotes.csv", ["QuoteID", "CustomerID", "Date", "Description", "Status"], quotes)
    write_csv(scenario_dir / "jobs.csv", ["JobID", "QuoteID", "CustomerID", "JobType", "Status"], jobs)
    write_csv(scenario_dir / "schedule.csv", ["JobID", "Technician", "StartTime", "EndTime"], schedule)
    write_csv(scenario_dir / "invoices.csv", ["InvoiceID", "JobID", "Date", "DueDate", "Subtotal", "Tax", "Total", "EstProfit", "Status"], invoices)
    write_csv(scenario_dir / "invoice_items.csv", ["InvoiceID", "Item", "Quantity", "UnitPrice", "LineTotal"], invoice_items)
    write_csv(scenario_dir / "materials_list.csv", ["ItemName", "UnitCost", "SellPrice"], [[k, v[0], v[1]] for k,v in MATERIALS.items()])

    # Zip files
    files_to_zip = ["customers.csv", "quotes.csv", "jobs.csv", "schedule.csv", "invoices.csv", "invoice_items.csv", "materials_list.csv"]
    zip_filename = output_dir / f"{scenario_name}.zip"
    
    with zipfile.ZipFile(zip_filename, 'w') as zipf:
        for file in files_to_zip:
            file_path = scenario_dir / file
            zipf.write(file_path, arcname=file)
    
    # Clean up individual CSVs (keep directory structure)
    for file in files_to_zip:
        (scenario_dir / file).unlink()
    scenario_dir.rmdir()
    
    print(f"  ✓ Generated {len(customers)} customers, {len(jobs)} jobs, {len(invoices)} invoices")
    print(f"  ✓ Saved to {zip_filename}")
    return zip_filename

if __name__ == "__main__":
    print("="*60)
    print("HVAC Mock Dataset Generator")
    print("="*60)
    
    scenarios = [
        # Scenario 1: Baseline - Healthy Steady Operations
        {
            "name": "baseline_steady_ops",
            "volume_multiplier": 1.0,
            "close_rate": 0.75,
            "payment_delay_avg": 21,
            "seasonal_variation": 1.0
        },
        
        # Scenario 2: Growing Business - Increasing Volume
        {
            "name": "growing_business",
            "volume_multiplier": 1.5,
            "close_rate": 0.70,
            "payment_delay_avg": 28,
            "seasonal_variation": 1.2
        },
        
        # Scenario 3: Struggling - Low Close Rate, Slow Payments
        {
            "name": "struggling_ops",
            "volume_multiplier": 0.6,
            "close_rate": 0.50,
            "payment_delay_avg": 45,
            "seasonal_variation": 0.8
        },
        
        # Scenario 4: Seasonal Heavy - Extreme Peaks/Valleys
        {
            "name": "seasonal_heavy",
            "volume_multiplier": 1.2,
            "close_rate": 0.80,
            "payment_delay_avg": 25,
            "seasonal_variation": 1.8
        },
        
        # Scenario 5: Premium Service - High Close, Fast Pay
        {
            "name": "premium_service",
            "volume_multiplier": 0.8,
            "close_rate": 0.90,
            "payment_delay_avg": 14,
            "seasonal_variation": 0.7
        },
        
        # Scenario 6: High Volume Reactive - Lots of Small Jobs
        {
            "name": "high_volume_reactive",
            "volume_multiplier": 2.0,
            "close_rate": 0.65,
            "payment_delay_avg": 35,
            "seasonal_variation": 1.5
        },
    ]
    
    print(f"\nGenerating {len(scenarios)} datasets...\n")
    
    for scenario in scenarios:
        generate_dataset(
            scenario["name"],
            scenario["volume_multiplier"],
            scenario["close_rate"],
            scenario["payment_delay_avg"],
            scenario["seasonal_variation"]
        )
        print()
    
    print("="*60)
    print(f"✓ All datasets generated successfully!")
    print(f"✓ Location: tmp/mock_datasets/")
    print("="*60)
