"""
Quick validation script to test mock datasets
Extracts and validates data structure from each ZIP
"""
import zipfile
import csv
from pathlib import Path

def validate_dataset(zip_path):
    """Validate a dataset ZIP file"""
    print(f"\n{'='*60}")
    print(f"Validating: {zip_path.name}")
    print('='*60)
    
    required_files = [
        "customers.csv",
        "quotes.csv", 
        "jobs.csv",
        "schedule.csv",
        "invoices.csv",
        "invoice_items.csv",
        "materials_list.csv"
    ]
    
    with zipfile.ZipFile(zip_path, 'r') as zf:
        files_in_zip = zf.namelist()
        
        # Check all required files present
        missing = [f for f in required_files if f not in files_in_zip]
        if missing:
            print(f"❌ Missing files: {missing}")
            return False
        
        print("✓ All required files present")
        
        # Validate each CSV
        for filename in required_files:
            with zf.open(filename) as f:
                reader = csv.reader(f.read().decode('utf-8').splitlines())
                rows = list(reader)
                header = rows[0]
                data_rows = rows[1:]
                
                print(f"\n{filename}:")
                print(f"  Headers: {', '.join(header)}")
                print(f"  Rows: {len(data_rows):,}")
                
                if len(data_rows) == 0:
                    print(f"  ⚠️  Warning: Empty dataset")
                
                # Show sample row
                if len(data_rows) > 0:
                    sample = data_rows[0]
                    print(f"  Sample: {sample[:3]}...")
        
        # Calculate key metrics
        with zf.open('quotes.csv') as f:
            quotes = list(csv.DictReader(f.read().decode('utf-8').splitlines()))
            total_quotes = len(quotes)
            accepted = sum(1 for q in quotes if q['Status'] == 'Accepted')
            close_rate = (accepted / total_quotes * 100) if total_quotes > 0 else 0
            
        with zf.open('invoices.csv') as f:
            invoices = list(csv.DictReader(f.read().decode('utf-8').splitlines()))
            paid = sum(1 for i in invoices if i['Status'] == 'Paid')
            total_inv = len(invoices)
            paid_rate = (paid / total_inv * 100) if total_inv > 0 else 0
            total_revenue = sum(float(i['Total']) for i in invoices)
            
        print(f"\n📊 Key Metrics:")
        print(f"  Quote Close Rate: {close_rate:.1f}%")
        print(f"  Payment Rate: {paid_rate:.1f}%")
        print(f"  Total Revenue: ${total_revenue:,.2f}")
        print(f"  Avg Invoice: ${total_revenue/len(invoices):,.2f}")
        
    return True

if __name__ == "__main__":
    datasets_dir = Path("tmp/mock_datasets")
    
    print("Mock Dataset Validation")
    print("="*60)
    
    zip_files = sorted(datasets_dir.glob("*.zip"))
    
    if not zip_files:
        print("❌ No dataset ZIP files found in tmp/mock_datasets/")
        exit(1)
    
    print(f"Found {len(zip_files)} datasets\n")
    
    results = {}
    for zip_file in zip_files:
        try:
            valid = validate_dataset(zip_file)
            results[zip_file.stem] = "✓ Valid" if valid else "❌ Invalid"
        except Exception as e:
            print(f"❌ Error validating {zip_file.name}: {e}")
            results[zip_file.stem] = "❌ Error"
    
    print(f"\n{'='*60}")
    print("Summary")
    print('='*60)
    for name, status in results.items():
        print(f"{status} - {name}")
    
    all_valid = all("✓" in v for v in results.values())
    print(f"\n{'✓ All datasets valid!' if all_valid else '❌ Some datasets had issues'}")
