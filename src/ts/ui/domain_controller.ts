import * as log from 'loglevel';
import Vector from '../vector';
import Util from '../util';

/**
 * Singleton
 * Controls panning and zooming
 */
export default class DomainController {
    private static instance: DomainController;

    private readonly ZOOM_SPEED = 0.92;
    private readonly WHEEL_STEP_BASE = 53;
    private readonly MIN_WHEEL_STEPS = 0.35;
    private readonly MAX_WHEEL_STEPS = 3;
    private readonly SCROLL_DELAY = 100;

    // Location of screen origin in world space
    private _origin: Vector = Vector.zeroVector();
    
    // Screen-space width and height
    private _screenDimensions = Vector.zeroVector();

    // Ratio of screen pixels to world pixels
    private _zoom: number = 1;
    private zoomCallback: () => any = () => {};
    private lastScrolltime = -this.SCROLL_DELAY;
    private refreshedAfterScroll = false;

    private _cameraDirection = Vector.zeroVector();
    private _orthographic = false;
    private viewAnimationFrame: number | null = null;
    private viewportInsetLeft = 0;
    private _viewRevision = 0;

    // Set after pan or zoom
    public moved = false;


    private constructor() {
        this.setScreenDimensions();

        window.addEventListener('resize', (): void => this.setScreenDimensions());

        window.addEventListener('wheel', (e: any): void => {
            if (e.target.id === Util.CANVAS_ID) {
                this.lastScrolltime = Date.now();
                this.refreshedAfterScroll = false;
                const delta: number = e.deltaY;

                if (!Number.isFinite(delta) || delta === 0) {
                    return;
                }

                const deltaMagnitude = Math.abs(delta);
                const wheelSteps = Math.max(
                    this.MIN_WHEEL_STEPS,
                    Math.min(this.MAX_WHEEL_STEPS, deltaMagnitude / this.WHEEL_STEP_BASE),
                );
                const zoomFactor = Math.pow(this.ZOOM_SPEED, wheelSteps);

                if (delta > 0) {
                    this.zoom = this._zoom * zoomFactor;
                } else {
                    this.zoom = this._zoom / zoomFactor;
                }
            }
        });

    }

    /**
     * Used to stop drawing buildings while scrolling for certain styles
     * to keep the framerate up
     */
    get isScrolling(): boolean {
        return Date.now() - this.lastScrolltime < this.SCROLL_DELAY;
    }

    get viewRevision(): number {
        return this._viewRevision;
    }

    private setScreenDimensions(): void {
        const inset = Math.max(0, Math.min(window.innerWidth, this.viewportInsetLeft));
        const nextWidth = Math.max(1, window.innerWidth - inset);
        const nextHeight = window.innerHeight;

        if (this._screenDimensions.x === nextWidth && this._screenDimensions.y === nextHeight) {
            return;
        }

        this._screenDimensions.setX(nextWidth);
        this._screenDimensions.setY(nextHeight);
        this.markMoved();
    }

    setViewportInsetLeft(inset: number): void {
        const nextInset = Math.max(0, inset);
        if (this.viewportInsetLeft === nextInset) {
            return;
        }

        this.viewportInsetLeft = nextInset;
        this.setScreenDimensions();
    }

    public static getInstance(): DomainController {
        if (!DomainController.instance) {
            DomainController.instance = new DomainController();
        }
        return DomainController.instance;
    }

    /**
     * @param {Vector} delta in world space
     */
    pan(delta: Vector, markViewChange = true): void {
        if (delta.x === 0 && delta.y === 0) {
            return;
        }

        this._origin.sub(delta);
        if (markViewChange) {
            this.markMoved();
        }
    }

    /**
     * Screen origin in world space
     */
    get origin(): Vector {
        return this._origin.clone();
    }

    get zoom(): number {
        return this._zoom;
    }

    get screenDimensions(): Vector {
        return this._screenDimensions.clone();
    }

    /**
     * @return {Vector} world-space w/h visible on screen
     */
    get worldDimensions(): Vector {
        return this.screenDimensions.divideScalar(this._zoom);
    }

    set screenDimensions(v: Vector) {
        if (this._screenDimensions.equals(v)) {
            return;
        }

        this._screenDimensions.copy(v);
        this.markMoved();
    }

    set zoom(z: number) {
        this.stopViewAnimation();
        if (z < 0.3 || z > 20 || z === this._zoom) {
            return;
        }

        const oldWorldSpaceMidpoint = this.origin.add(this.worldDimensions.divideScalar(2));
        this._zoom = z;
        const newWorldSpaceMidpoint = this.origin.add(this.worldDimensions.divideScalar(2));
        this.pan(newWorldSpaceMidpoint.sub(oldWorldSpaceMidpoint), false);
        this.markMoved();
        this.zoomCallback();
    }

    centerOnWorldPoint(point: Vector): void {
        this.stopViewAnimation();
        const halfWorld = this.worldDimensions.divideScalar(2);
        this._origin = point.clone().sub(halfWorld);
        this.markMoved();
    }

    animateToWorldPoint(point: Vector, options?: { zoom?: number; durationMs?: number }): void {
        this.stopViewAnimation();

        const targetZoom = Math.min(20, Math.max(0.3, options?.zoom ?? this._zoom));
        const durationMs = Math.max(0, options?.durationMs ?? 650);

        const startCenter = this.origin.add(this.worldDimensions.divideScalar(2));
        const startZoom = this._zoom;
        const targetCenter = point.clone();

        if (durationMs === 0) {
            this.applyViewState(targetCenter, targetZoom);
            return;
        }

        let startTime: number | null = null;

        const step = (timestamp: number): void => {
            if (startTime === null) {
                startTime = timestamp;
            }

            const elapsed = timestamp - startTime;
            const progress = Math.min(1, elapsed / durationMs);
            const eased = this.easeInOutCubic(progress);

            const nextCenter = new Vector(
                startCenter.x + (targetCenter.x - startCenter.x) * eased,
                startCenter.y + (targetCenter.y - startCenter.y) * eased,
            );
            const nextZoom = startZoom + (targetZoom - startZoom) * eased;

            this.applyViewState(nextCenter, nextZoom);

            if (progress < 1) {
                this.viewAnimationFrame = requestAnimationFrame(step);
            } else {
                this.viewAnimationFrame = null;
            }
        };

        this.viewAnimationFrame = requestAnimationFrame(step);
    }

    onScreen(v: Vector): boolean {
        const screenSpace = this.worldToScreen(v.clone());
        return screenSpace.x >= 0 && screenSpace.y >= 0
            && screenSpace.x <= this.screenDimensions.x && screenSpace.y <= this.screenDimensions.y;
    }

    set orthographic(v: boolean) {
        if (this._orthographic === v) {
            return;
        }

        this._orthographic = v;
        this.markMoved();
    }

    get orthographic(): boolean {
        return this._orthographic;
    }

    set cameraDirection(v: Vector) {
        if (this._cameraDirection.equals(v)) {
            return;
        }

        this._cameraDirection = v;
        this.markMoved();
    }

    get cameraDirection(): Vector {
        return this._cameraDirection.clone();
    }

    getCameraPosition(): Vector {
        const centre = new Vector(this._screenDimensions.x / 2, this._screenDimensions.y / 2);
        if (this._orthographic) {
            return centre.add(centre.clone().multiply(this._cameraDirection).multiplyScalar(100));
        }
        return centre.add(centre.clone().multiply(this._cameraDirection));
        // this.screenDimensions.divideScalar(2);
    }

    setZoomUpdate(callback: () => any): void {
        this.zoomCallback = callback;
    }

    private stopViewAnimation(): void {
        if (this.viewAnimationFrame !== null) {
            cancelAnimationFrame(this.viewAnimationFrame);
            this.viewAnimationFrame = null;
        }
    }

    private applyViewState(center: Vector, zoom: number): void {
        const previousZoom = this._zoom;
        const previousOrigin = this._origin;
        this._zoom = zoom;
        const halfWorld = this.screenDimensions.divideScalar(2 * this._zoom);
        this._origin = center.clone().sub(halfWorld);
        if (previousZoom !== this._zoom || !previousOrigin.equals(this._origin)) {
            this.markMoved();
        }
        this.zoomCallback();
    }

    private markMoved(): void {
        this.moved = true;
        this._viewRevision += 1;
    }

    private easeInOutCubic(t: number): number {
        if (t < 0.5) {
            return 4 * t * t * t;
        }

        return 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    /**
     * Edits vector
     */
    zoomToWorld(v: Vector): Vector {
        return v.divideScalar(this._zoom);
    }

    /**
     * Edits vector
     */
    zoomToScreen(v: Vector): Vector {
        return v.multiplyScalar(this._zoom);
    }

    /**
     * Edits vector
     */
    screenToWorld(v: Vector): Vector {
        const inset = Math.max(0, Math.min(window.innerWidth, this.viewportInsetLeft));
        const localScreen = v.clone().sub(new Vector(inset, 0));
        return this.zoomToWorld(localScreen).add(this._origin);
    }

    /**
     * Edits vector
     */
    worldToScreen(v: Vector): Vector {
        return this.zoomToScreen(v.sub(this._origin));
    }
}
