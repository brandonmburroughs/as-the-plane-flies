# BTS Flight Data Download Instructions

This directory is for storing raw CSV files downloaded from the Bureau of Transportation Statistics (BTS).

## Quick Start

1. Go to the BTS download page (link below)
2. Select the required fields
3. Download data for your desired time period
4. Place CSV files in this directory
5. Run the processor script

## Step-by-Step Download Instructions

### 1. Visit the BTS On-Time Performance Download Page

Go to: **https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FGJ**

### 2. Select Required Fields

Under "Select Fields", check the following boxes:

**Required:**
- ☑️ Origin
- ☑️ Dest
- ☑️ ActualElapsedTime

**Recommended (optional):**
- ☑️ Cancelled (helps filter out cancelled flights)
- ☑️ Year
- ☑️ Month
- ☑️ FlightDate

### 3. Filter by Time Period

- Use "Filter Year" dropdown to select year(s)
- Use "Filter Period" dropdown to select month(s)
- **Recommended:** Download at least 3-6 months of data for better averages

### 4. Download

- Click "Download" button
- Save the ZIP file
- Extract the CSV file to this directory (`scripts/raw-data/`)

### 5. Run the Processor

From the project root, run:

```bash
node scripts/data-pipeline/process-bts-data.js scripts/raw-data/
```

Or for a single file:

```bash
node scripts/data-pipeline/process-bts-data.js scripts/raw-data/your-file.csv
```

## Data Size Expectations

| Time Period | Approximate Size |
|-------------|-----------------|
| 1 month     | ~50-80 MB       |
| 3 months    | ~150-250 MB     |
| 6 months    | ~300-500 MB     |
| 12 months   | ~600 MB - 1 GB  |

## Tips

- **More data = better averages**: The processor calculates average flight times, so more months of data gives more accurate results
- **Recent data is best**: Use the most recent available data for current flight times
- **Multiple files OK**: You can download multiple months and place all CSVs in this directory - the processor will combine them

## Falling Back to Simulated Data

If you want to revert to the simulated data:

```bash
cp data/matrix-simulated.json data/matrix.json
```

## Data Source

Bureau of Transportation Statistics (BTS)
U.S. Department of Transportation

- Main site: https://www.bts.gov/
- On-Time Data: https://www.transtats.bts.gov/ontime/
- Download page: https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FGJ
