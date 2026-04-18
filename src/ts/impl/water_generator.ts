import * as log from 'loglevel';
import Vector from '../vector';
import FieldIntegrator from './integrator';
import StreamlineGenerator from './streamlines';
import {StreamlineParams} from './streamlines';
import TensorField from './tensor_field';
import PolygonUtil from './polygon_util';

export interface WaterParams extends StreamlineParams {
    coastNoise: NoiseStreamlineParams;
    riverNoise: NoiseStreamlineParams;
    riverBankSize: number;
    riverSize: number;
}

export interface NoiseStreamlineParams {
    noiseEnabled: boolean;
    noiseSize: number;
    noiseAngle: number;
}

/**
 * Integrates polylines to create coastline and river, with controllable noise
 */
export default class WaterGenerator extends StreamlineGenerator {
    private readonly TRIES = 100;
    private coastlineMajor = true;
    private _coastline: Vector[] = [];  // Noisy line
    private _seaPolygon: Vector[] = [];  // Uses screen rectangle and simplified road
    private _riverPolygon: Vector[] = []; // Simplified
    private _riverSecondaryRoad: Vector[] = [];

    constructor(integrator: FieldIntegrator,
                origin: Vector,
                worldDimensions: Vector,
                protected params: WaterParams,
                private tensorField: TensorField) {
        super(integrator, origin, worldDimensions, params);
    }

    get coastline(): Vector[] {
        return this._coastline;
    }

    get seaPolygon(): Vector[] {
        return this._seaPolygon;
    }

    get riverPolygon(): Vector[] {
        return this._riverPolygon;
    }

    get riverSecondaryRoad(): Vector[] {
        return this._riverSecondaryRoad;
    }

    createCoast(): void {
        let coastStreamline: Vector[] = [];
        let major = false;

        if (this.params.coastNoise.noiseEnabled) {
            this.tensorField.enableGlobalNoise(this.params.coastNoise.noiseAngle, this.params.coastNoise.noiseSize);    
        }
        for (let i = 0; i < this.TRIES; i++) {
            major = Math.random() < 0.5;
            const seed = this.getSeed(major);
            if (!seed) {
                continue;
            }
            coastStreamline = this.extendStreamline(this.integrateStreamline(seed, major));

            if (this.reachesEdges(coastStreamline)) {
                break;
            }
        }
        this.tensorField.disableGlobalNoise();

        if (coastStreamline.length < 2) {
            log.error('Failed to find coast reaching edge');
            return;
        }

        this._coastline = coastStreamline;
        this.coastlineMajor = major;

        const road = this.simplifyStreamline(coastStreamline);
        this._seaPolygon = this.getSeaPolygon(road);
        this.allStreamlinesSimple.push(road);
        this.tensorField.sea = (this._seaPolygon);

        // Create intermediate samples
        const complex = this.complexifyStreamline(road);
        this.grid(major).addPolyline(complex);
        this.streamlines(major).push(complex);
        this.allStreamlines.push(complex);
    }

    createRiver(): void {
        let riverStreamline: Vector[] = [];

        // Need to ignore sea when integrating for edge check
        const oldSea = this.tensorField.sea;
        this.tensorField.sea = [];
        if (this.params.riverNoise.noiseEnabled) {
            this.tensorField.enableGlobalNoise(this.params.riverNoise.noiseAngle, this.params.riverNoise.noiseSize);    
        }        
        for (let i = 0; i < this.TRIES; i++) {
            const seed = this.getSeed(!this.coastlineMajor);
            if (!seed) {
                continue;
            }
            riverStreamline = this.extendStreamline(this.integrateStreamline(seed, !this.coastlineMajor));

            if (this.reachesEdges(riverStreamline)) {
                break;
            } else if (i === this.TRIES - 1) {
                log.error('Failed to find river reaching edge');
            }
        }
        this.tensorField.sea = oldSea;
        this.tensorField.disableGlobalNoise();

        if (riverStreamline.length < 2) {
            return;
        }

        // Create river roads
        const expandedNoisy = this.complexifyStreamline(PolygonUtil.resizeGeometry(riverStreamline, this.params.riverSize, false));
        this._riverPolygon = PolygonUtil.resizeGeometry(riverStreamline, this.params.riverSize - this.params.riverBankSize, false);
        // Make sure riverPolygon[0] is off screen
        const firstOffScreen = expandedNoisy.findIndex(v => this.vectorOffScreen(v));
        for (let i = 0; i < firstOffScreen; i++) {
            const shifted = expandedNoisy.shift();
            if (!shifted) {
                break;
            }
            expandedNoisy.push(shifted);
        }

        // Create river roads
        const riverSplitPoly = this.getSeaPolygon(riverStreamline);
        const road1 = expandedNoisy.filter(v =>
            !PolygonUtil.insidePolygon(v, this._seaPolygon)
            && !this.vectorOffScreen(v)
            && PolygonUtil.insidePolygon(v, riverSplitPoly));
        const road1Simple = this.simplifyStreamline(road1);
        const road2 = expandedNoisy.filter(v =>
            !PolygonUtil.insidePolygon(v, this._seaPolygon)
            && !this.vectorOffScreen(v)
            && !PolygonUtil.insidePolygon(v, riverSplitPoly));
        const road2Simple = this.simplifyStreamline(road2);

        if (road1.length === 0 || road2.length === 0) return;

        const road1Start = road1[0];
        const road2Start = road2[0];
        const road2End = road2[road2.length - 1];

        if (!road1Start || !road2Start || !road2End) return;

        if (road1Start.distanceToSquared(road2Start) < road1Start.distanceToSquared(road2End)) {
            road2Simple.reverse();
        }

        this.tensorField.river = road1Simple.concat(road2Simple);

        // Road 1
        this.allStreamlinesSimple.push(road1Simple);
        this._riverSecondaryRoad = road2Simple;

        this.grid(!this.coastlineMajor).addPolyline(road1);
        this.grid(!this.coastlineMajor).addPolyline(road2);
        this.streamlines(!this.coastlineMajor).push(road1);
        this.streamlines(!this.coastlineMajor).push(road2);
        this.allStreamlines.push(road1);
        this.allStreamlines.push(road2);
    }

    /**
     * Assumes simplified
     * Used for adding river roads
     */
    private manuallyAddStreamline(s: Vector[], major: boolean): void {
        this.allStreamlinesSimple.push(s);
        // Create intermediate samples
        const complex = this.complexifyStreamline(s);
        this.grid(major).addPolyline(complex);
        this.streamlines(major).push(complex);
        this.allStreamlines.push(complex);
    }

    /**
     * Might reverse input array
     */
    private getSeaPolygon(polyline: Vector[]): Vector[] {
        // const seaPolygon = PolygonUtil.sliceRectangle(this.origin, this.worldDimensions,
        //     polyline[0], polyline[polyline.length - 1]);

        // // Replace the longest side with coastline
        // let longestIndex = 0;
        // let longestLength = 0;
        // for (let i = 0; i < seaPolygon.length; i++) {
        //     const next = (i + 1) % seaPolygon.length;
        //     const d = seaPolygon[i].distanceToSquared(seaPolygon[next]);
        //     if (d > longestLength) {
        //         longestLength = d;
        //         longestIndex = i;
        //     }
        // }

        // const insertBackwards = seaPolygon[longestIndex].distanceToSquared(polyline[0]) > seaPolygon[longestIndex].distanceToSquared(polyline[polyline.length - 1]);
        // if (insertBackwards) {
        //     polyline.reverse();
        // }

        // seaPolygon.splice((longestIndex + 1) % seaPolygon.length, 0, ...polyline);
        
        return PolygonUtil.lineRectanglePolygonIntersection(this.origin, this.worldDimensions, polyline);

        // return PolygonUtil.boundPolyToScreen(this.origin, this.worldDimensions, seaPolygon);
    }

    /**
     * Insert samples in streamline until separated by dstep
     */
    private complexifyStreamline(s: Vector[]): Vector[] {
        const out: Vector[] = [];
        for (let i = 0; i < s.length - 1; i++) {
            const start = s[i];
            const end = s[i + 1];
            if (!start || !end) {
                continue;
            }
            out.push(...this.complexifyStreamlineRecursive(start, end));
        }
        return out;
    }

    private complexifyStreamlineRecursive(v1: Vector, v2: Vector): Vector[] {
        if (v1.distanceToSquared(v2) <= this.paramsSq.dstep) {
            return [v1, v2];
        }
        const d = v2.clone().sub(v1);
        const halfway = v1.clone().add(d.multiplyScalar(0.5));
        
        const complex = this.complexifyStreamlineRecursive(v1, halfway);
        complex.push(...this.complexifyStreamlineRecursive(halfway, v2));
        return complex;
    }

    /**
     * Mutates streamline
     */
    private extendStreamline(streamline: Vector[]): Vector[] {
        if (streamline.length < 2) {
            return streamline;
        }

        const first = streamline[0];
        const second = streamline[1];
        const last = streamline[streamline.length - 1];
        const beforeLast = streamline[streamline.length - 2];

        if (!first || !second || !last || !beforeLast) {
            return streamline;
        }

        streamline.unshift(first.clone().add(first.clone().sub(second).setLength(this.params.dstep * 5)));
        streamline.push(last.clone().add(last.clone().sub(beforeLast).setLength(this.params.dstep * 5)));
        return streamline;
    }

    private reachesEdges(streamline: Vector[]): boolean {
        const first = streamline[0];
        const last = streamline[streamline.length - 1];
        if (!first || !last) {
            return false;
        }
        return this.vectorOffScreen(first) && this.vectorOffScreen(last);
    }

    private vectorOffScreen(v: Vector): boolean {
        const toOrigin = v.clone().sub(this.origin);
        return toOrigin.x <= 0 || toOrigin.y <= 0 ||
            toOrigin.x >= this.worldDimensions.x || toOrigin.y >= this.worldDimensions.y;
    }
}
