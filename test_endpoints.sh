#!/bin/bash

echo "=== Testing OpenCode Dashboard Endpoints ==="
echo ""

# Test each endpoint
endpoints=(
  "http://localhost:3001/"
  "http://localhost:3001/graph"
  "http://localhost:3001/memory"
  "http://localhost:3001/learning"
  "http://localhost:3001/models"
  "http://localhost:3001/config"
  "http://localhost:3001/health"
  "http://localhost:3001/docs"
)

for endpoint in "${endpoints[@]}"; do
  echo "Testing: $endpoint"
  response=$(curl -s -w "\n%{http_code}" "$endpoint" 2>&1)
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)
  
  echo "HTTP Status: $http_code"
  
  # Check for error indicators in response
  if echo "$body" | grep -q "500\|error\|Error\|ERROR"; then
    echo "WARNING: Response contains error indicators"
    echo "$body" | grep -i "error" | head -3
  fi
  
  # Check for specific content
  if echo "$body" | grep -q "Workflow\|Knowledge\|Memory\|Learning\|Models\|Config\|Health\|Docs"; then
    echo "Content: Page content found"
  else
    echo "Content: Minimal or no expected content"
  fi
  
  echo "---"
  echo ""
done
