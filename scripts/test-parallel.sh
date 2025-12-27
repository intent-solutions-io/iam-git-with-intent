#!/bin/bash
#
# High-Performance Parallel Test Runner
#
# Uses Vitest with maximum parallelism, sharding, and coverage reporting.
# Designed for CI/CD and local development with optimal performance.
#

set -e

# Configuration
SHARD_COUNT=${SHARD_COUNT:-4}  # Number of shards (default: 4)
COVERAGE=${COVERAGE:-true}     # Enable coverage (default: true)
BAIL=${BAIL:-0}                # Bail after N failures (default: 0 = don't bail)
RETRY=${RETRY:-0}              # Retry failed tests N times (default: 0)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  High-Performance Parallel Test Runner${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Detect CPU count
CPU_COUNT=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
echo -e "${GREEN}✓${NC} Detected ${YELLOW}${CPU_COUNT}${NC} CPU cores"

# Clean previous test results
echo -e "${GREEN}✓${NC} Cleaning previous test results..."
rm -rf coverage/ test-results/ 2>/dev/null || true
mkdir -p test-results coverage

# Function to run tests with sharding
run_sharded_tests() {
    local shard=$1
    local total=$2

    echo -e "${BLUE}[Shard ${shard}/${total}]${NC} Running tests..."

    local cmd="npx vitest run --shard=${shard}/${total}"

    # Add coverage flag
    if [ "$COVERAGE" = "true" ]; then
        cmd="$cmd --coverage"
    fi

    # Add bail flag
    if [ "$BAIL" -gt 0 ]; then
        cmd="$cmd --bail=${BAIL}"
    fi

    # Add retry flag
    if [ "$RETRY" -gt 0 ]; then
        cmd="$cmd --retry=${RETRY}"
    fi

    # Run the tests
    $cmd > "test-results/shard-${shard}.log" 2>&1 &
    echo $!
}

# Strategy 1: Sharded Parallel Execution
echo ""
echo -e "${YELLOW}Strategy: Sharded Parallel Execution (${SHARD_COUNT} shards)${NC}"
echo ""

# Array to store PIDs
pids=()

# Start all shards in parallel
for i in $(seq 1 $SHARD_COUNT); do
    pid=$(run_sharded_tests $i $SHARD_COUNT)
    pids+=($pid)
    echo -e "${GREEN}✓${NC} Started shard ${i}/${SHARD_COUNT} (PID: ${pid})"
done

echo ""
echo -e "${YELLOW}Waiting for all shards to complete...${NC}"

# Wait for all shards and collect exit codes
failed=0
for i in "${!pids[@]}"; do
    pid=${pids[$i]}
    shard=$((i + 1))

    if wait $pid; then
        echo -e "${GREEN}✓${NC} Shard ${shard}/${SHARD_COUNT} completed successfully"
    else
        echo -e "${RED}✗${NC} Shard ${shard}/${SHARD_COUNT} failed"
        failed=$((failed + 1))
    fi
done

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Display shard logs
echo ""
echo -e "${YELLOW}Shard Logs:${NC}"
for i in $(seq 1 $SHARD_COUNT); do
    echo ""
    echo -e "${BLUE}━━━ Shard ${i}/${SHARD_COUNT} ━━━${NC}"
    tail -30 "test-results/shard-${i}.log" || echo "No log found"
done

# Summary
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Test Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "Total shards: ${YELLOW}${SHARD_COUNT}${NC}"
echo -e "Failed shards: ${RED}${failed}${NC}"
echo -e "Passed shards: ${GREEN}$((SHARD_COUNT - failed))${NC}"
echo ""

# Coverage report
if [ "$COVERAGE" = "true" ] && [ -d "coverage" ]; then
    echo -e "${YELLOW}Coverage Report:${NC}"
    if [ -f "coverage/coverage-summary.json" ]; then
        cat coverage/coverage-summary.json | head -20
    fi
    echo ""
    echo -e "${GREEN}✓${NC} Full coverage report: ${YELLOW}coverage/index.html${NC}"
fi

# Test results
if [ -f "test-results/results.json" ]; then
    echo -e "${GREEN}✓${NC} Test results: ${YELLOW}test-results/results.json${NC}"
    echo -e "${GREEN}✓${NC} Test report: ${YELLOW}test-results/index.html${NC}"
fi

echo ""

# Exit with failure if any shard failed
if [ $failed -gt 0 ]; then
    echo -e "${RED}✗ Tests failed (${failed} shard(s) failed)${NC}"
    exit 1
else
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
fi
