class FramerGeometry {
  static buildGraph(lines) {
    const nodes = [];
    const edges = [];
    const nodeMap = new Map();

    function getNodeIndex(point) {
      for(let [idx, p] of nodeMap.entries()) {
        if(p.equals(point)) return idx;
      }
      const idx = nodes.length;
      nodes.push(point);
      nodeMap.set(idx, point);
      return idx;
    }

    lines.forEach(line => {
      getNodeIndex(line.start);
      getNodeIndex(line.end);
    });

    const intersections = [];
    for(let i = 0; i < lines.length; i++) {
      for(let j = i + 1; j < lines.length; j++) {
        const intersection = GeometryUtils.lineIntersection(lines[i].start,
          lines[i].end, lines[j].start, lines[j].end);
        if(intersection) {
          intersections.push({
            point: intersection,
            lineIndices: [i, j]
          });
          getNodeIndex(intersection);
        }
      }
    }

    lines.forEach((line, lineIdx) => {
      const lineIntersections = intersections
        .filter(int => int.lineIndices.includes(lineIdx))
        .map(int => int.point);

      const points = [line.start, ...lineIntersections, line.end];

      points.sort((a, b) => {
        const distA = line.start.distanceTo(a);
        const distB = line.start.distanceTo(b);
        return distA - distB;
      });

      for(let i = 0; i < points.length - 1; i++) {
        const startIdx = getNodeIndex(points[i]);
        const endIdx = getNodeIndex(points[i + 1]);
        edges.push({
          start: startIdx,
          end: endIdx,
          startPoint: points[i],
          endPoint: points[i + 1]
        });
      }
    });

    return {
      nodes,
      edges
    };
  }

  static buildAdjacencyList(nodes, edges) {
    const adj = Array(nodes.length).fill(null).map(() => []);

    edges.forEach((edge, idx) => {
      adj[edge.start].push({
        node: edge.end,
        edgeIdx: idx
      });
      adj[edge.end].push({
        node: edge.start,
        edgeIdx: idx
      });
    });

    return adj;
  }

  static getAngle(p1, center, p2) {
    const v1 = p1.sub(center);
    const v2 = p2.sub(center);

    let angle = v2.angle - v1.angle;
    if(angle < 0) angle += 2 * Math.PI;
    return angle;
  }

  static findRegions(nodes, edges) {
    const adj = FramerGeometry.buildAdjacencyList(nodes, edges);
    const usedEdges = new Set();
    const regions = [];

    edges.forEach((edge, edgeIdx) => {
      if(usedEdges.has(edgeIdx)) return;

      for(let reverse of [false, true]) {
        const startNode = reverse ? edge.end : edge.start;
        const currentNode = reverse ? edge.start : edge.end;
        const cycle = FramerGeometry.findSmallestCycle(nodes, adj,
          startNode, currentNode, edgeIdx, usedEdges, edges.length);

        if(cycle && cycle.length >= 3) {
          cycle.forEach(e => usedEdges.add(e));
          regions.push(cycle);
        }
      }
    });

    return regions;
  }

  static findSmallestCycle(nodes, adj, startNode, currentNode, startEdge,
    usedEdges, maxEdges) {
    const visited = new Set([startEdge]);
    const path = [startEdge];
    let current = currentNode;
    let previous = startNode;

    while(current !== startNode) {
      const neighbors = adj[current];
      if(neighbors.length === 0) return null;

      let bestNeighbor = null;
      let smallestAngle = Infinity;

      for(let neighbor of neighbors) {
        if(neighbor.node === previous) continue;
        if(visited.has(neighbor.edgeIdx)) continue;

        const angle = FramerGeometry.getAngle(
          nodes[previous],
          nodes[current],
          nodes[neighbor.node]
        );

        if(angle < smallestAngle) {
          smallestAngle = angle;
          bestNeighbor = neighbor;
        }
      }

      if(!bestNeighbor) return null;

      if(bestNeighbor.node === startNode) {
        path.push(bestNeighbor.edgeIdx);
        return path;
      }

      visited.add(bestNeighbor.edgeIdx);
      path.push(bestNeighbor.edgeIdx);
      previous = current;
      current = bestNeighbor.node;

      if(path.length > maxEdges) return null;
    }

    return null;
  }

  static getRegionPoints(region, edges) {
    if(region.length === 0) return [];

    const points = [];
    const usedEdges = new Set();

    let currentEdge = edges[region[0]];
    points.push(currentEdge.startPoint);
    let nextPoint = currentEdge.endPoint;
    usedEdges.add(region[0]);

    while(usedEdges.size < region.length) {
      let found = false;

      for(let edgeIdx of region) {
        if(usedEdges.has(edgeIdx)) continue;

        const edge = edges[edgeIdx];

        if(nextPoint.equals(edge.startPoint)) {
          points.push(edge.startPoint);
          nextPoint = edge.endPoint;
          usedEdges.add(edgeIdx);
          found = true;
          break;
        } else if(nextPoint.equals(edge.endPoint)) {
          points.push(edge.endPoint);
          nextPoint = edge.startPoint;
          usedEdges.add(edgeIdx);
          found = true;
          break;
        }
      }

      if(!found) break;
    }

    return points;
  }

  static getSignedArea(points) {
    if(points.length < 3) return 0;

    let area = 0;
    for(let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return area / 2;
  }
}

// Auto-generated exports
if (typeof window !== 'undefined') window.FramerGeometry = FramerGeometry;
export { FramerGeometry };
