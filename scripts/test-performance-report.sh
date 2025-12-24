#!/bin/bash
#
# Test Performance Report Generation
#
# This script tests the performance report generator locally
# without requiring GCS or GitHub infrastructure.
#

set -e

echo "Testing Auto-Fix Performance Report Generator"
echo "=============================================="
echo ""

# Build the report generator
echo "Building report generator..."
npx tsc scripts/generate-performance-report.ts \
  --outDir scripts/dist \
  --esModuleInterop \
  --resolveJsonModule \
  --skipLibCheck \
  --moduleResolution node

echo "✓ Build complete"
echo ""

# Check if test database exists
TEST_DB="${1:-./autofix-test.db}"

if [ ! -f "$TEST_DB" ]; then
  echo "Test database not found at $TEST_DB"
  echo ""
  echo "Usage: $0 [path-to-test-database]"
  echo ""
  echo "To test with production data:"
  echo "  1. Download database from GCS: gsutil cp gs://your-bucket/autofix.db ./autofix-test.db"
  echo "  2. Run: $0 ./autofix-test.db"
  echo ""
  echo "To create test database with sample data:"
  echo "  node packages/core/dist/database/seed-test-data.js > autofix-test.db"
  exit 1
fi

echo "Using database: $TEST_DB"
echo ""

# Generate report for current week
echo "Generating report for current week..."
DB_PATH="$TEST_DB" \
WEEK_OFFSET=0 \
INCLUDE_CHARTS=true \
OUTPUT_FILE=./report-current.md \
node scripts/dist/generate-performance-report.js

echo "✓ Current week report generated: report-current.md"
echo ""

# Generate report for last week
echo "Generating report for last week..."
DB_PATH="$TEST_DB" \
WEEK_OFFSET=1 \
INCLUDE_CHARTS=true \
OUTPUT_FILE=./report-last-week.md \
node scripts/dist/generate-performance-report.js

echo "✓ Last week report generated: report-last-week.md"
echo ""

# Show sample output
echo "Sample output (first 50 lines):"
echo "--------------------------------"
head -n 50 report-current.md
echo ""
echo "... (truncated)"
echo ""

# Report sizes
echo "Report sizes:"
echo "  Current week: $(wc -c < report-current.md) bytes"
echo "  Last week:    $(wc -c < report-last-week.md) bytes"
echo ""

echo "✓ All tests passed!"
echo ""
echo "Generated reports:"
echo "  - report-current.md"
echo "  - report-last-week.md"
