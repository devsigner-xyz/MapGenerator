import { describe, expect, test } from 'vitest';
import Vector from '../vector';
import { TrafficParticlesSimulation } from './traffic_particles';

function seededRandom(seed: number): () => number {
    let value = seed >>> 0;
    return () => {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 0x100000000;
    };
}

function createCurveNetwork(): Vector[][] {
    return [[
        new Vector(0, 0),
        new Vector(10, 0),
        new Vector(10, 10),
    ]];
}

function createIntersectionNetwork(): Vector[][] {
    return [
        [new Vector(0, 0), new Vector(10, 0)],
        [new Vector(10, 0), new Vector(20, 0)],
        [new Vector(10, 0), new Vector(10, 10)],
        [new Vector(10, 0), new Vector(10, -10)],
    ];
}

function createClosedLoopNetwork(): Vector[][] {
    return [[
        new Vector(0, 0),
        new Vector(10, 0),
        new Vector(10, 10),
        new Vector(0, 10),
        new Vector(0, 0),
    ]];
}

describe('TrafficParticlesSimulation', () => {
    test('continues through degree-2 curve vertex without random branching', () => {
        const simulation = new TrafficParticlesSimulation({ random: () => 0 });
        simulation.setWorldBounds({ minX: -100, minY: -100, maxX: 100, maxY: 100 });
        simulation.setNetwork(createCurveNetwork());
        simulation.setCount(1);

        const edgeId = simulation.debugFindEdgeId(new Vector(0, 0), new Vector(10, 0));
        simulation.debugSetParticleState(0, edgeId, 9.9);
        simulation.step(0.2);

        const transition = simulation.debugGetLastTransition(0);
        expect(transition).not.toBeNull();
        if (!transition) {
            return;
        }

        expect(transition.usedRandomAtJunction).toBe(false);

        const toEdge = simulation.debugGetEdge(transition.toEdgeId);
        expect(toEdge.from.equals(new Vector(10, 0))).toBe(true);
        expect(toEdge.to.equals(new Vector(10, 10))).toBe(true);
    });

    test('chooses random outgoing edge at real intersections including reverse edge', () => {
        const simulation = new TrafficParticlesSimulation({ random: seededRandom(42) });
        simulation.setWorldBounds({ minX: -100, minY: -100, maxX: 100, maxY: 100 });
        simulation.setNetwork(createIntersectionNetwork());
        simulation.setCount(1);

        const incomingEdge = simulation.debugFindEdgeId(new Vector(0, 0), new Vector(10, 0));
        const picks = {
            reverse: 0,
            straight: 0,
            up: 0,
            down: 0,
        };

        for (let i = 0; i < 300; i++) {
            simulation.debugSetParticleState(0, incomingEdge, 9.9);
            simulation.step(0.2);
            const transition = simulation.debugGetLastTransition(0);
            if (!transition) {
                continue;
            }

            const toEdge = simulation.debugGetEdge(transition.toEdgeId);

            if (toEdge.to.equals(new Vector(0, 0))) {
                picks.reverse += 1;
            } else if (toEdge.to.equals(new Vector(20, 0))) {
                picks.straight += 1;
            } else if (toEdge.to.equals(new Vector(10, 10))) {
                picks.up += 1;
            } else if (toEdge.to.equals(new Vector(10, -10))) {
                picks.down += 1;
            }
        }

        expect(picks.reverse).toBeGreaterThan(0);
        expect(picks.straight).toBeGreaterThan(0);
        expect(picks.up).toBeGreaterThan(0);
        expect(picks.down).toBeGreaterThan(0);
    });

    test('prefers turning at real intersections to improve visible motion', () => {
        const simulation = new TrafficParticlesSimulation({ random: seededRandom(7) });
        simulation.setWorldBounds({ minX: -100, minY: -100, maxX: 100, maxY: 100 });
        simulation.setNetwork(createIntersectionNetwork());
        simulation.setCount(1);

        const incomingEdge = simulation.debugFindEdgeId(new Vector(0, 0), new Vector(10, 0));
        const picks = {
            reverse: 0,
            straight: 0,
            turn: 0,
        };

        for (let i = 0; i < 500; i++) {
            simulation.debugSetParticleState(0, incomingEdge, 9.9);
            simulation.step(0.2);
            const transition = simulation.debugGetLastTransition(0);
            if (!transition) {
                continue;
            }

            const toEdge = simulation.debugGetEdge(transition.toEdgeId);

            if (toEdge.to.equals(new Vector(0, 0))) {
                picks.reverse += 1;
            } else if (toEdge.to.equals(new Vector(20, 0))) {
                picks.straight += 1;
            } else {
                picks.turn += 1;
            }
        }

        const turnRatio = picks.turn / 500;
        expect(turnRatio).toBeGreaterThan(0.65);
    });

    test('disables rendering output when particle count is zero', () => {
        const simulation = new TrafficParticlesSimulation();
        simulation.setWorldBounds({ minX: -100, minY: -100, maxX: 100, maxY: 100 });
        simulation.setNetwork(createCurveNetwork());
        simulation.setCount(0);

        expect(simulation.getParticleCount()).toBe(0);
        expect(simulation.step(0.016)).toEqual([]);
    });

    test('respawns particles that move outside world bounds', () => {
        const simulation = new TrafficParticlesSimulation({ random: () => 0.1 });
        simulation.setWorldBounds({ minX: 0, minY: -5, maxX: 5, maxY: 5 });
        simulation.setNetwork([[new Vector(0, 0), new Vector(10, 0)]]);
        simulation.setCount(1);

        const edgeId = simulation.debugFindEdgeId(new Vector(0, 0), new Vector(10, 0));
        simulation.debugSetParticleState(0, edgeId, 9);
        simulation.step(0);

        expect(simulation.debugGetRespawnCount(0)).toBeGreaterThan(0);
    });

    test('applies carry-over distance when crossing into next edge', () => {
        const simulation = new TrafficParticlesSimulation({ random: () => 0, baseSpeed: 2 });
        simulation.setWorldBounds({ minX: -100, minY: -100, maxX: 100, maxY: 100 });
        simulation.setNetwork(createCurveNetwork());
        simulation.setCount(1);

        const edgeId = simulation.debugFindEdgeId(new Vector(0, 0), new Vector(10, 0));
        simulation.debugSetParticleState(0, edgeId, 9.8);
        simulation.step(1);

        const particle = simulation.debugGetParticleState(0);
        const nextEdge = simulation.debugGetEdge(particle.edgeId);
        expect(nextEdge.from.equals(new Vector(10, 0))).toBe(true);
        expect(nextEdge.to.equals(new Vector(10, 10))).toBe(true);
        expect(particle.distanceOnEdge).toBeCloseTo(1.8, 5);
        expect(simulation.debugLastStepUsedCarryOver(0)).toBe(true);
    });

    test('uses faster default speed profile for continuous traffic motion', () => {
        const simulation = new TrafficParticlesSimulation({ random: () => 0 });
        simulation.setWorldBounds({ minX: -100, minY: -100, maxX: 100, maxY: 100 });
        simulation.setNetwork([[new Vector(0, 0), new Vector(100, 0)]]);
        simulation.setCount(1);

        const edgeId = simulation.debugFindEdgeId(new Vector(0, 0), new Vector(100, 0));
        simulation.debugSetParticleState(0, edgeId, 0);
        simulation.step(1);

        const particle = simulation.debugGetParticleState(0);
        expect(particle.distanceOnEdge).toBeCloseTo(32, 5);
    });

    test('emits compact particles suitable for subtle mini-car look', () => {
        const simulation = new TrafficParticlesSimulation({ random: () => 0 });
        simulation.setWorldBounds({ minX: -100, minY: -100, maxX: 100, maxY: 100 });
        simulation.setNetwork([[new Vector(0, 0), new Vector(100, 0)]]);
        simulation.setCount(1);

        const particles = simulation.step(0.016);
        expect(particles).toHaveLength(1);
        const firstParticle = particles[0];
        expect(firstParticle).toBeDefined();
        if (!firstParticle) {
            return;
        }

        expect(firstParticle.radiusPx).toBeCloseTo(0.75, 5);
        expect(firstParticle.haloPx).toBeCloseTo(2.2, 5);
    });

    test('respawns when stuck in closed non-junction loop segments', () => {
        const simulation = new TrafficParticlesSimulation({ random: () => 0 });
        simulation.setWorldBounds({ minX: -100, minY: -100, maxX: 100, maxY: 100 });
        simulation.setNetwork(createClosedLoopNetwork());
        simulation.setCount(1);

        const edgeId = simulation.debugFindEdgeId(new Vector(0, 0), new Vector(10, 0));
        simulation.debugSetParticleState(0, edgeId, 9.9);
        const beforeRespawn = simulation.debugGetRespawnCount(0);

        simulation.step(3);

        const afterRespawn = simulation.debugGetRespawnCount(0);
        expect(afterRespawn).toBeGreaterThan(beforeRespawn);
    });
});
