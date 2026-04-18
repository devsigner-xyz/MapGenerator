import Vector from '../vector';

interface TrafficNode {
    id: number;
    point: Vector;
    outEdgeIds: number[];
    neighbourNodeIds: Set<number>;
    degree: number;
}

interface TrafficEdge {
    id: number;
    fromNodeId: number;
    toNodeId: number;
    from: Vector;
    to: Vector;
    length: number;
}

interface TrafficParticle {
    edgeId: number;
    distanceOnEdge: number;
    speedFactor: number;
    respawnCount: number;
    lastStepUsedCarryOver: boolean;
    lastTransition: TrafficParticleTransition | null;
    visitedEdgesSinceJunction: Set<number>;
}

export interface TrafficParticleTransition {
    fromEdgeId: number;
    toEdgeId: number;
    nodeId: number;
    usedRandomAtJunction: boolean;
}

export interface TrafficRenderParticle {
    center: Vector;
    radiusPx: number;
    haloPx: number;
    alpha: number;
}

export interface TrafficWorldBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface TrafficSimulationOptions {
    random?: () => number;
    baseSpeed?: number;
}

const DEFAULT_NODE_MERGE_TOLERANCE = 1;
const MIN_EDGE_LENGTH = 0.0001;

export class TrafficParticlesSimulation {
    private readonly random: () => number;
    private readonly baseSpeed: number;
    private readonly nodeMergeTolerance: number;
    private speedMultiplier = 1;
    private nodes: TrafficNode[] = [];
    private edges: TrafficEdge[] = [];
    private particles: TrafficParticle[] = [];
    private worldBounds: TrafficWorldBounds | null = null;

    constructor(options: TrafficSimulationOptions = {}) {
        this.random = options.random ?? Math.random;
        this.baseSpeed = options.baseSpeed ?? 32;
        this.nodeMergeTolerance = DEFAULT_NODE_MERGE_TOLERANCE;
    }

    setWorldBounds(bounds: TrafficWorldBounds): void {
        this.worldBounds = {
            minX: Math.min(bounds.minX, bounds.maxX),
            minY: Math.min(bounds.minY, bounds.maxY),
            maxX: Math.max(bounds.minX, bounds.maxX),
            maxY: Math.max(bounds.minY, bounds.maxY),
        };
    }

    setNetwork(polylines: Vector[][]): void {
        this.nodes = [];
        this.edges = [];
        const nodeIdByKey = new Map<string, number>();

        const getOrCreateNodeId = (point: Vector): number => {
            const key = this.toNodeKey(point);
            const existing = nodeIdByKey.get(key);
            if (existing !== undefined) {
                return existing;
            }

            const nodeId = this.nodes.length;
            nodeIdByKey.set(key, nodeId);
            this.nodes.push({
                id: nodeId,
                point: point.clone(),
                outEdgeIds: [],
                neighbourNodeIds: new Set<number>(),
                degree: 0,
            });
            return nodeId;
        };

        const addDirectedEdge = (fromNodeId: number, toNodeId: number): void => {
            const fromNode = this.nodes[fromNodeId];
            const toNode = this.nodes[toNodeId];
            if (!fromNode || !toNode) {
                return;
            }

            const from = fromNode.point;
            const to = toNode.point;
            const length = from.distanceTo(to);
            if (length < MIN_EDGE_LENGTH) {
                return;
            }

            const edgeId = this.edges.length;
            this.edges.push({
                id: edgeId,
                fromNodeId,
                toNodeId,
                from: from.clone(),
                to: to.clone(),
                length,
            });
            fromNode.outEdgeIds.push(edgeId);
            fromNode.neighbourNodeIds.add(toNodeId);
        };

        for (const polyline of polylines || []) {
            if (!polyline || polyline.length < 2) {
                continue;
            }

            for (let i = 1; i < polyline.length; i++) {
                const from = polyline[i - 1];
                const to = polyline[i];
                if (!from || !to) {
                    continue;
                }

                const fromNodeId = getOrCreateNodeId(from);
                const toNodeId = getOrCreateNodeId(to);
                addDirectedEdge(fromNodeId, toNodeId);
                addDirectedEdge(toNodeId, fromNodeId);
            }
        }

        for (const node of this.nodes) {
            node.degree = node.neighbourNodeIds.size;
        }

        for (let i = 0; i < this.particles.length; i++) {
            this.respawnParticle(i);
        }
    }

    setCount(count: number): void {
        const nextCount = Math.max(0, Math.min(50, Math.round(count)));
        if (nextCount === this.particles.length) {
            return;
        }

        if (nextCount < this.particles.length) {
            this.particles.length = nextCount;
            return;
        }

        while (this.particles.length < nextCount) {
            this.particles.push({
                edgeId: -1,
                distanceOnEdge: 0,
                speedFactor: 1,
                respawnCount: 0,
                lastStepUsedCarryOver: false,
                lastTransition: null,
                visitedEdgesSinceJunction: new Set<number>(),
            });
            this.respawnParticle(this.particles.length - 1);
        }
    }

    setSpeedMultiplier(speed: number): void {
        if (!Number.isFinite(speed)) {
            this.speedMultiplier = 1;
            return;
        }

        this.speedMultiplier = Math.max(0.2, Math.min(3, speed));
    }

    getParticleCount(): number {
        return this.particles.length;
    }

    step(deltaSeconds: number): TrafficRenderParticle[] {
        if (this.particles.length === 0 || this.edges.length === 0) {
            return [];
        }

        const safeDelta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
        const renderParticles: TrafficRenderParticle[] = [];

        for (let i = 0; i < this.particles.length; i++) {
            const particle = this.particles[i];
            if (!particle) {
                continue;
            }

            particle.lastStepUsedCarryOver = false;
            particle.lastTransition = null;

            if (!this.isValidEdgeId(particle.edgeId)) {
                this.respawnParticle(i);
            }

            let travelDistance = this.baseSpeed * this.speedMultiplier * particle.speedFactor * safeDelta;
            let safety = 0;
            while (travelDistance > 0 && safety < 16) {
                safety += 1;
                const currentEdge = this.edges[particle.edgeId];
                if (!currentEdge) {
                    this.respawnParticle(i);
                    break;
                }
                const remaining = currentEdge.length - particle.distanceOnEdge;

                if (travelDistance < remaining) {
                    particle.distanceOnEdge += travelDistance;
                    travelDistance = 0;
                    break;
                }

                travelDistance -= remaining;
                particle.distanceOnEdge = currentEdge.length;
                const nextEdge = this.chooseNextEdge(currentEdge.toNodeId, currentEdge.id);
                if (nextEdge === null) {
                    this.respawnParticle(i);
                    break;
                }

                if (nextEdge.usedRandomAtJunction) {
                    particle.visitedEdgesSinceJunction.clear();
                }

                if (particle.visitedEdgesSinceJunction.has(nextEdge.edgeId)) {
                    this.respawnParticle(i);
                    break;
                }

                particle.visitedEdgesSinceJunction.add(nextEdge.edgeId);

                particle.lastTransition = {
                    fromEdgeId: currentEdge.id,
                    toEdgeId: nextEdge.edgeId,
                    nodeId: currentEdge.toNodeId,
                    usedRandomAtJunction: nextEdge.usedRandomAtJunction,
                };
                particle.edgeId = nextEdge.edgeId;
                particle.distanceOnEdge = 0;
                if (travelDistance > 0) {
                    particle.lastStepUsedCarryOver = true;
                }
            }

            if (!this.isValidEdgeId(particle.edgeId)) {
                this.respawnParticle(i);
            }

            let position = this.getParticleWorldPosition(particle);
            if (!this.isWithinWorldBounds(position)) {
                this.respawnParticle(i);
                const respawnedParticle = this.particles[i];
                if (!respawnedParticle) {
                    continue;
                }
                position = this.getParticleWorldPosition(respawnedParticle);
            }

            renderParticles.push({
                center: position,
                radiusPx: 0.75,
                haloPx: 2.2,
                alpha: 0.16,
            });
        }

        return renderParticles;
    }

    debugFindEdgeId(from: Vector, to: Vector): number {
        const edge = this.edges.find((candidate) => candidate.from.equals(from) && candidate.to.equals(to));
        if (!edge) {
            throw new Error(`Edge not found from (${from.x},${from.y}) to (${to.x},${to.y})`);
        }

        return edge.id;
    }

    debugSetParticleState(index: number, edgeId: number, distanceOnEdge: number): void {
        const particle = this.particles[index];
        if (!particle) {
            throw new Error(`Particle index out of range: ${index}`);
        }
        if (!this.isValidEdgeId(edgeId)) {
            throw new Error(`Invalid edge id: ${edgeId}`);
        }

        const edge = this.edges[edgeId];
        if (!edge) {
            throw new Error(`Invalid edge id: ${edgeId}`);
        }

        particle.edgeId = edgeId;
        particle.distanceOnEdge = Math.max(0, Math.min(edge.length, distanceOnEdge));
        particle.speedFactor = 1;
        particle.lastTransition = null;
        particle.lastStepUsedCarryOver = false;
        particle.visitedEdgesSinceJunction.clear();
        particle.visitedEdgesSinceJunction.add(edgeId);
    }

    debugGetLastTransition(index: number): TrafficParticleTransition | null {
        return this.particles[index]?.lastTransition ?? null;
    }

    debugGetEdge(edgeId: number): TrafficEdge {
        if (!this.isValidEdgeId(edgeId)) {
            throw new Error(`Invalid edge id: ${edgeId}`);
        }

        const edge = this.edges[edgeId];
        if (!edge) {
            throw new Error(`Invalid edge id: ${edgeId}`);
        }

        return edge;
    }

    debugGetRespawnCount(index: number): number {
        return this.particles[index]?.respawnCount ?? 0;
    }

    debugGetParticleState(index: number): { edgeId: number; distanceOnEdge: number } {
        const particle = this.particles[index];
        if (!particle) {
            throw new Error(`Particle index out of range: ${index}`);
        }

        return {
            edgeId: particle.edgeId,
            distanceOnEdge: particle.distanceOnEdge,
        };
    }

    debugLastStepUsedCarryOver(index: number): boolean {
        return Boolean(this.particles[index]?.lastStepUsedCarryOver);
    }

    private respawnParticle(index: number): void {
        const particle = this.particles[index];
        if (!particle) {
            return;
        }

        if (this.edges.length === 0) {
            particle.edgeId = -1;
            particle.distanceOnEdge = 0;
            return;
        }

        const edge = this.edges[this.randomIndex(this.edges.length)];
        if (!edge) {
            particle.edgeId = -1;
            particle.distanceOnEdge = 0;
            return;
        }

        particle.edgeId = edge.id;
        particle.distanceOnEdge = this.random() * edge.length;
        particle.speedFactor = 0.85 + this.random() * 0.3;
        particle.respawnCount += 1;
        particle.lastTransition = null;
        particle.visitedEdgesSinceJunction.clear();
        particle.visitedEdgesSinceJunction.add(edge.id);
    }

    private chooseNextEdge(nodeId: number, incomingEdgeId: number): { edgeId: number; usedRandomAtJunction: boolean } | null {
        const node = this.nodes[nodeId];
        if (!node || node.outEdgeIds.length === 0) {
            return null;
        }

        if (node.degree >= 3) {
            const junctionChoice = this.chooseWeightedJunctionEdge(node.outEdgeIds, incomingEdgeId);
            if (junctionChoice === null) {
                return null;
            }

            return {
                edgeId: junctionChoice,
                usedRandomAtJunction: true,
            };
        }

        const continuation = this.findGeometricContinuationEdge(node.outEdgeIds, incomingEdgeId);
        if (continuation === null) {
            return null;
        }

        return {
            edgeId: continuation,
            usedRandomAtJunction: false,
        };
    }

    private findGeometricContinuationEdge(outEdgeIds: number[], incomingEdgeId: number): number | null {
        if (outEdgeIds.length === 0) {
            return null;
        }

        const incoming = this.edges[incomingEdgeId];
        if (!incoming) {
            return outEdgeIds[0] ?? null;
        }

        const incomingDirection = incoming.to.clone().sub(incoming.from).normalize();
        let bestEdgeId: number | null = null;
        let bestScore = -Infinity;

        for (const edgeId of outEdgeIds) {
            const candidate = this.edges[edgeId];
            if (!candidate) {
                continue;
            }

            const outgoingDirection = candidate.to.clone().sub(candidate.from).normalize();
            const score = incomingDirection.dot(outgoingDirection);
            if (score > bestScore) {
                bestScore = score;
                bestEdgeId = edgeId;
            }
        }

        return bestEdgeId;
    }

    private chooseWeightedJunctionEdge(outEdgeIds: number[], incomingEdgeId: number): number | null {
        if (outEdgeIds.length === 0) {
            return null;
        }

        const incoming = this.edges[incomingEdgeId];
        if (!incoming) {
            return outEdgeIds[this.randomIndex(outEdgeIds.length)] ?? null;
        }

        const incomingDirection = incoming.to.clone().sub(incoming.from);
        if (incomingDirection.lengthSq() === 0) {
            return outEdgeIds[this.randomIndex(outEdgeIds.length)] ?? null;
        }
        incomingDirection.normalize();

        const weightedCandidates: Array<{ edgeId: number; weight: number }> = [];
        let totalWeight = 0;

        for (const edgeId of outEdgeIds) {
            const candidate = this.edges[edgeId];
            if (!candidate) {
                continue;
            }

            const outgoingDirection = candidate.to.clone().sub(candidate.from);
            if (outgoingDirection.lengthSq() === 0) {
                continue;
            }
            outgoingDirection.normalize();

            const angleAbs = Math.abs(Vector.angleBetween(outgoingDirection, incomingDirection));
            let weight = 1;

            if (angleAbs < Math.PI / 6) {
                weight = 0.25;
            } else if (angleAbs > Math.PI * 0.85) {
                weight = 0.1;
            } else {
                weight = 1 + (angleAbs / Math.PI) * 0.2;
            }

            totalWeight += weight;
            weightedCandidates.push({ edgeId, weight });
        }

        if (weightedCandidates.length === 0 || totalWeight <= 0) {
            return outEdgeIds[this.randomIndex(outEdgeIds.length)] ?? null;
        }

        let roll = this.random() * totalWeight;
        for (const candidate of weightedCandidates) {
            roll -= candidate.weight;
            if (roll <= 0) {
                return candidate.edgeId;
            }
        }

        const fallbackCandidate = weightedCandidates[weightedCandidates.length - 1];
        return fallbackCandidate ? fallbackCandidate.edgeId : null;
    }

    private getParticleWorldPosition(particle: TrafficParticle): Vector {
        const edge = this.edges[particle.edgeId];
        if (!edge || edge.length <= 0) {
            return Vector.zeroVector();
        }

        const t = Math.max(0, Math.min(1, particle.distanceOnEdge / edge.length));
        return new Vector(
            edge.from.x + (edge.to.x - edge.from.x) * t,
            edge.from.y + (edge.to.y - edge.from.y) * t,
        );
    }

    private isWithinWorldBounds(point: Vector): boolean {
        if (!this.worldBounds) {
            return true;
        }

        return point.x >= this.worldBounds.minX
            && point.x <= this.worldBounds.maxX
            && point.y >= this.worldBounds.minY
            && point.y <= this.worldBounds.maxY;
    }

    private toNodeKey(point: Vector): string {
        const tolerance = this.nodeMergeTolerance;
        const xKey = Math.round(point.x / tolerance);
        const yKey = Math.round(point.y / tolerance);
        return `${xKey}:${yKey}`;
    }

    private randomIndex(size: number): number {
        if (size <= 1) {
            return 0;
        }

        return Math.min(size - 1, Math.floor(this.random() * size));
    }

    private isValidEdgeId(edgeId: number): boolean {
        return Number.isInteger(edgeId) && edgeId >= 0 && edgeId < this.edges.length;
    }
}
