# Mock HVAC Business Datasets

Generated realistic test data for 6 different HVAC business scenarios covering a full year (2025).

## Dataset Scenarios

### 1. **baseline_steady_ops.zip** - Healthy Steady Operations
- **Volume**: Baseline (1.0x)
- **Close Rate**: 75%
- **Payment Cycle**: 21 days average
- **Seasonality**: Normal (1.0x)
- **Stats**: 1,508 customers | 1,120 jobs | 1,120 invoices
- **Use Case**: Reference for "typical healthy business" - good for establishing baselines

### 2. **growing_business.zip** - Growing Business
- **Volume**: Above average (1.5x)
- **Close Rate**: 70%
- **Payment Cycle**: 28 days average
- **Seasonality**: Higher swings (1.2x)
- **Stats**: 2,533 customers | 1,805 jobs | 1,805 invoices
- **Use Case**: Tests capacity pressure, scheduling drift as volume increases

### 3. **struggling_ops.zip** - Struggling Operations
- **Volume**: Below average (0.6x)
- **Close Rate**: 50% (poor)
- **Payment Cycle**: 45 days average (slow)
- **Seasonality**: Muted (0.8x)
- **Stats**: 740 customers | 388 jobs | 388 invoices
- **Use Case**: Tests follow-up drift, cash cycle issues, conversion friction

### 4. **seasonal_heavy.zip** - Extreme Seasonal Business
- **Volume**: Above baseline (1.2x)
- **Close Rate**: 80%
- **Payment Cycle**: 25 days average
- **Seasonality**: Extreme peaks/valleys (1.8x)
- **Stats**: 2,407 customers | 1,931 jobs | 1,931 invoices
- **Use Case**: Tests rhythm volatility, capacity planning during peaks

### 5. **premium_service.zip** - Premium Service Model
- **Volume**: Below average (0.8x) - selective
- **Close Rate**: 90% (excellent)
- **Payment Cycle**: 14 days (fast)
- **Seasonality**: Smooth (0.7x)
- **Stats**: 1,051 customers | 940 jobs | 940 invoices
- **Use Case**: Reference for "high-quality low-volume" model - stable operations

### 6. **high_volume_reactive.zip** - High Volume Reactive
- **Volume**: Double baseline (2.0x)
- **Close Rate**: 65%
- **Payment Cycle**: 35 days average
- **Seasonality**: High swings (1.5x)
- **Stats**: 3,628 customers | 2,352 jobs | 2,352 invoices
- **Use Case**: Tests capacity squeeze, scheduling chaos, cash pressure

## Data Structure

Each ZIP contains 7 CSV files:

1. **customers.csv** - Customer records (ID, Name, Address, Phone, Email)
2. **quotes.csv** - Quotes generated (ID, CustomerID, Date, Description, Status)
3. **jobs.csv** - Accepted jobs (ID, QuoteID, CustomerID, JobType, Status)
4. **schedule.csv** - Technician scheduling (JobID, Technician, StartTime, EndTime)
5. **invoices.csv** - Billing records (ID, JobID, Date, DueDate, Subtotal, Tax, Total, EstProfit, Status)
6. **invoice_items.csv** - Line items (InvoiceID, Item, Quantity, UnitPrice, LineTotal)
7. **materials_list.csv** - Parts catalog (ItemName, UnitCost, SellPrice)

## Business Context

- **Location**: Phoenix, AZ metro (8 service areas)
- **Team**: 5 technicians (Miguel, Armando, Steve, David, Junior)
- **Labor Rate**: $125/hour
- **Services**: AC Repair, AC Installation, Heating Repair, Heat Pump Install, Maintenance, Air Quality
- **Season Pattern**: 
  - Peak: May-Sept (AC season) - 1.5x to 2.8x volume
  - Moderate: Nov-Jan (heating season) - 0.8x to 1.0x volume
  - Low: Feb-Apr, Oct (shoulder seasons) - 0.7x to 1.2x volume

## Testing the Decision Artifact System

### Recommended Test Sequence:

1. **baseline_steady_ops** - Establish what "normal" looks like
2. **premium_service** - Verify system handles low-volume/high-quality correctly
3. **growing_business** - Check capacity pressure detection
4. **struggling_ops** - Test follow-up drift and conversion friction signals
5. **seasonal_heavy** - Verify rhythm volatility and seasonality handling
6. **high_volume_reactive** - Stress test scheduling and cash cycle logic

### Expected Pressure Points by Scenario:

| Scenario | Expected Signals |
|----------|------------------|
| baseline_steady_ops | Low pressure across all dimensions |
| growing_business | Capacity squeeze, approved→scheduled lag |
| struggling_ops | Follow-up drift, conversion friction, fragility |
| seasonal_heavy | Rhythm volatility, capacity swings |
| premium_service | Minimal pressure (reference for "good") |
| high_volume_reactive | Capacity squeeze, cash cycle pressure, scheduling chaos |

### Benchmark Comparisons:

All datasets use **trades_hvac_service** cohort. Expected percentile ranges:

- **Premium Service**: Should rank 25th-40th percentile (better than peers) on most risk metrics
- **Struggling Ops**: Should rank 65th-85th percentile (worse than peers) on risk metrics
- **Others**: Should cluster around 40th-60th percentile (typical)

## Generation

Generated using `scripts/generate_mock_datasets.py`:
```bash
python scripts/generate_mock_datasets.py
```

Recreate anytime to get fresh data with same characteristics.
