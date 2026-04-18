import Vector from '../vector';
import { SVG } from '@svgdotjs/svg.js';
import rough from 'roughjs/bundled/rough.esm.js';
import Util from '../util';

interface SvgHost {
    appendChild(node: unknown): void;
}

interface SvgPolyline {
    attr(attrs: Record<string, unknown>): void;
}

interface SvgApi {
    rect(attrs: Record<string, unknown>): unknown;
    polyline(points: Array<[number, number]>): SvgPolyline;
}

interface RoughRenderer {
    rectangle(x: number, y: number, width: number, height: number, options: RoughOptions): unknown;
    polygon(points: Array<[number, number]>, options: RoughOptions): unknown;
    linearPath(points: Array<[number, number]>, options: RoughOptions): unknown;
}

export interface RoughOptions {
    roughness?: number;
    bowing?: number;
    seed?: number;
    stroke?: string;
    strokeWidth?: number;
    fill?: string;
    fillStyle?: string;
    fillWeight?: number;
    hachureAngle?: number;
    hachureGap?: number;
    dashOffset?: number;
    dashGap?: number;
    zigzagOffset?: number;
}

/**
 * Thin wrapper around HTML canvas, abstracts drawing functions so we can use the RoughJS canvas or the default one
 */
export default abstract class CanvasWrapper {
    protected svgNode: SvgHost | null = null;
    protected _width = 0;
    protected _height = 0;
    public needsUpdate: boolean = false;

    constructor(private canvas: HTMLCanvasElement, protected _scale=1, resizeToWindow=true) {
        this.setDimensions();
        this.resizeCanvas();
        if (resizeToWindow) {
            window.addEventListener('resize', (): void => {
                this.setDimensions();
                this.resizeCanvas();
            });
        }
    }

    protected appendSvgNode(node: unknown): void {
        if (this.svgNode) {
            this.svgNode.appendChild(node);
        }
    }

    createSVG(svgElement: unknown): void {
        if (!svgElement || typeof svgElement !== 'object' || !('appendChild' in svgElement)) {
            this.svgNode = null;
            return;
        }

        this.svgNode = svgElement as SvgHost;
    }

    abstract drawFrame(left: number, right: number, up: number, down: number): void;

    drawRotatedText(_text: string, _center: Vector, _angleRad: number, _fontPx: number): void {
        return;
    }

    setDimensions(): void {
        const elementWidth = this.canvas.clientWidth || this.canvas.getBoundingClientRect().width || window.innerWidth;
        const elementHeight = this.canvas.clientHeight || this.canvas.getBoundingClientRect().height || window.innerHeight;
        this._width = elementWidth * this._scale;
        this._height = elementHeight * this._scale;
    }

    get width(): number {
        return this._width;
    }

    get height(): number {
        return this._height;
    }

    get canvasScale(): number {
        return this._scale;
    }

    set canvasScale(s: number) {
        this._scale = s;
        this.setDimensions();
        this.resizeCanvas();
    }

    protected zoomVectors(vs: Vector[]): Vector[] {
        if (this._scale === 1) return vs;
        return vs.map(v => v.clone().multiplyScalar(this._scale));
    }

    protected resizeCanvas(): void {
        this.canvas.width = this._width;
        this.canvas.height = this._height;
        this.needsUpdate = true;
    }
}

export class DefaultCanvasWrapper extends CanvasWrapper {
    private ctx: CanvasRenderingContext2D;
    private svg: SvgApi | null = null;

    constructor(canvas: HTMLCanvasElement, scale=1, resizeToWindow=true) {
        super(canvas, scale, resizeToWindow);
        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error('Unable to get 2D canvas context');
        }
        this.ctx = context;
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this._width / this._scale, this._height / this._scale);
    }

    createSVG(svgElement: unknown): void {
        super.createSVG(svgElement);
        if (!this.svgNode) {
            this.svg = null;
            return;
        }

        this.svg = SVG(this.svgNode as unknown as SVGElement) as unknown as SvgApi;
    }

    setFillStyle(colour: string): void {
        this.ctx.fillStyle = colour;
    }

    clearCanvas(): void {
        const logicalWidth = this._width / this._scale;
        const logicalHeight = this._height / this._scale;
        if (this.svgNode) {
            // Expanded to cover whole drawn area
            const startW = logicalWidth * (Util.DRAW_INFLATE_AMOUNT - 1) / 2;
            const startH = logicalHeight * (Util.DRAW_INFLATE_AMOUNT - 1) / 2;
            this.drawRectangle(-startW, -startH, logicalWidth * Util.DRAW_INFLATE_AMOUNT, logicalHeight * Util.DRAW_INFLATE_AMOUNT);
        } else {
            this.drawRectangle(0, 0, logicalWidth, logicalHeight);
        }
    }

    drawFrame(left: number, right: number, up: number, down: number): void {
        this.drawRectangle(0, 0, this._width/this._scale, up);
        this.drawRectangle(0, 0, left, this._height/this._scale);
        this.drawRectangle(this._width/this._scale - right, 0, right, this._height/this._scale);
        this.drawRectangle(0, this._height/this._scale - down, this._width/this._scale, down);
    }

    drawCityName(): void {
        const fontSize = 50 * this._scale;
        this.ctx.font = `small-caps ${fontSize}px Verdana`;
        this.ctx.textAlign = "center";
        this.ctx.fillText("san francisco", this._width/2, this._height - (80 * this._scale - fontSize));
    }

    drawRotatedText(text: string, center: Vector, angleRad: number, fontPx: number): void {
        if (!text) {
            return;
        }

        const fontSize = Math.max(1, fontPx * this._scale);
        const x = center.x * this._scale;
        const y = center.y * this._scale;

        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(angleRad);
        this.ctx.font = `300 ${fontSize}px Verdana`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, 0, 0);
        this.ctx.restore();
    }

    drawRectangle(x: number, y: number, width: number, height: number): void {
        if (this._scale !== 1) {
            x *= this._scale;
            y *= this._scale;
            width *= this._scale;
            height *= this._scale;
        }
        this.ctx.fillRect(x, y, width, height);

        if (this.svg) {
            this.svg.rect({
                fill: this.ctx.fillStyle,
                'fill-opacity': 1,
                stroke: this.ctx.strokeStyle,
                'stroke-width': this.ctx.lineWidth,
                x: x,
                y: y,
                width: width,
                height: height,
            });
        }
    }

    drawPolygon(polygon: Vector[]): void {
        if (polygon.length === 0) {
            return;
        }
        polygon = this.zoomVectors(polygon);

        const firstPoint = polygon[0];
        if (!firstPoint) {
            return;
        }

        this.ctx.beginPath();
        this.ctx.moveTo(firstPoint.x, firstPoint.y);

        for (let i = 1; i < polygon.length; i++) {
            const point = polygon[i];
            if (!point) {
                continue;
            }
            this.ctx.lineTo(point.x, point.y);
        }
        this.ctx.lineTo(firstPoint.x, firstPoint.y);

        this.ctx.fill();
        this.ctx.stroke();

        if (this.svg) {
            const vectorArray: Array<[number, number]> = polygon.map(v => [v.x, v.y]);
            const firstVector = vectorArray[0];
            if (!firstVector) {
                return;
            }
            vectorArray.push(firstVector);
            this.svg.polyline(vectorArray).attr({
                fill: this.ctx.fillStyle,
                'fill-opacity': 1,
                stroke: this.ctx.strokeStyle,
                'stroke-width': this.ctx.lineWidth,
            });
        }
    }

    drawCircle(centre: Vector, radius: number): void {
        const TAU = 2 * Math.PI;
        this.ctx.beginPath();
        this.ctx.arc(centre.x, centre.y, radius, 0, TAU);
        this.ctx.fill();
    }

    drawSquare(centre: Vector, radius: number): void {
        this.drawRectangle(centre.x - radius, centre.y - radius, 2 * radius, 2 * radius);
    }

    setLineWidth(width: number): void {
        if (this._scale !== 1) {
            width *= this._scale;
        }
        this.ctx.lineWidth = width;
    }

    setStrokeStyle(colour: string): void {
        this.ctx.strokeStyle = colour;
    }

    drawPolyline(line: Vector[]): void {
        if (line.length < 2) {
            return;
        }

        line = this.zoomVectors(line);
        const firstPoint = line[0];
        if (!firstPoint) {
            return;
        }

        this.ctx.beginPath();
        this.ctx.moveTo(firstPoint.x, firstPoint.y);

        for (let i = 1; i < line.length; i++) {
            const point = line[i];
            if (!point) {
                continue;
            }
            this.ctx.lineTo(point.x, point.y);
        }

        this.ctx.stroke();

        if (this.svg) {
            const vectorArray: Array<[number, number]> = line.map(v => [v.x, v.y]);
            this.svg.polyline(vectorArray).attr({
                'fill-opacity': 0,
                stroke: this.ctx.strokeStyle,
                'stroke-width': this.ctx.lineWidth,
            });
        }
    }
}

export class RoughCanvasWrapper extends CanvasWrapper {
    private rc: RoughRenderer;
        
    private options: RoughOptions = {
        roughness: 1,
        bowing: 1,
        stroke: '#000000',
        strokeWidth: 1,
        fill: '#000000',
        fillStyle: 'solid',
    };

    constructor(canvas: HTMLCanvasElement, scale=1, resizeToWindow=true) {
        super(canvas, scale, resizeToWindow);
        this.rc = rough.canvas(canvas) as unknown as RoughRenderer;
    }

    createSVG(svgElement: unknown): void {
        super.createSVG(svgElement);
        if (!this.svgNode) {
            return;
        }

        this.rc = rough.svg(this.svgNode as unknown as SVGSVGElement) as unknown as RoughRenderer;
    }

    drawFrame(_left: number, _right: number, _up: number, _down: number): void {

    }

    drawRotatedText(_text: string, _center: Vector, _angleRad: number, _fontPx: number): void {
        return;
    }

    setOptions(options: RoughOptions): void {
        if (options.strokeWidth) {
            options.strokeWidth *= this._scale;
        }
        Object.assign(this.options, options);
    }

    clearCanvas(): void {
        const logicalWidth = this._width / this._scale;
        const logicalHeight = this._height / this._scale;
        if (this.svgNode) {
            // Expanded to cover whole drawn area
            const startW = logicalWidth * (Util.DRAW_INFLATE_AMOUNT - 1) / 2;
            const startH = logicalHeight * (Util.DRAW_INFLATE_AMOUNT - 1) / 2;
            this.drawRectangle(-startW, -startH, logicalWidth * Util.DRAW_INFLATE_AMOUNT, logicalHeight * Util.DRAW_INFLATE_AMOUNT);
        } else {
            this.drawRectangle(0, 0, logicalWidth, logicalHeight);
        }
    }

    drawRectangle(x: number, y: number, width: number, height: number): void {
        if (this._scale !== 1) {
            x *= this._scale;
            y *= this._scale;
            width *= this._scale;
            height *= this._scale;
        }
        this.appendSvgNode(this.rc.rectangle(x, y, width, height, this.options));
    }

    drawPolygon(polygon: Vector[]): void {
        if (polygon.length === 0) {
            return;
        }

        if (this._scale !== 1) {
            polygon = polygon.map(v => v.clone().multiplyScalar(this._scale));
        }

        const points: Array<[number, number]> = polygon.map(v => [v.x, v.y]);
        this.appendSvgNode(this.rc.polygon(points, this.options));
    }

    drawSquare(centre: Vector, radius: number): void {
        const prevStroke = this.options.stroke;
        this.options.stroke = 'none';
        this.drawRectangle(centre.x - radius, centre.y - radius, 2 * radius, 2 * radius);
        if (prevStroke === undefined) {
            delete this.options.stroke;
        } else {
            this.options.stroke = prevStroke;
        }
    }

    drawPolyline(line: Vector[]): void {
        if (line.length < 2) {
            return;
        }

        if (this._scale !== 1) {
            line = line.map(v => v.clone().multiplyScalar(this._scale));
        }

        const points: Array<[number, number]> = line.map(v => [v.x, v.y]);
        this.appendSvgNode(this.rc.linearPath(points, this.options));
    }
}
