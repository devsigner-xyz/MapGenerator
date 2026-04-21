import DomainController from './domain_controller';
import FieldIntegrator from '../impl/integrator';
import {StreamlineParams} from '../impl/streamlines';
import StreamlineGenerator from '../impl/streamlines';
import {
    calculatePathIterations,
    inflateGenerationBounds,
    resolveInitialGenerationBounds,
    type GenerationBounds,
} from './map_generation_context';
import Util from '../util';
import Vector from '../vector';

/**
 * Handles creation of roads
 */
export default class RoadGUI {
    protected streamlines: StreamlineGenerator;
    private existingStreamlines: RoadGUI[] = [];
    protected domainController = DomainController.getInstance();
    protected preGenerateCallback: () => void = () => {};
    protected postGenerateCallback: () => void = () => {};

    private streamlinesInProgress: boolean = false;

    constructor(protected params: StreamlineParams,
                protected integrator: FieldIntegrator,
                protected guiFolder: dat.GUI,
                protected closeTensorFolder: () => void,
                protected folderName: string,
                protected redraw: () => void,
                protected _animate=false) {
        this.streamlines = new StreamlineGenerator(
            this.integrator, this.domainController.origin,
            this.domainController.worldDimensions, this.params);

        this.setPathIterations(this.domainController.screenDimensions);
        window.addEventListener('resize', (): void => this.setPathIterations(this.domainController.screenDimensions));
    }

    initFolder(): RoadGUI {
        const roadGUI = {
            Generate: () => this.generateRoads(undefined, this._animate).then(() => this.redraw()),
            JoinDangling: (): void => {
                this.streamlines.joinDanglingStreamlines();
                this.redraw();
            },
        };

        const folder = this.guiFolder.addFolder(this.folderName);
        folder.add(roadGUI, 'Generate');
        // folder.add(roadGUI, 'JoinDangling');
        
        const paramsFolder = folder.addFolder('Params');
        paramsFolder.add(this.params, 'dsep');
        paramsFolder.add(this.params, 'dtest');

        const devParamsFolder = paramsFolder.addFolder('Dev');
        this.addDevParamsToFolder(this.params, devParamsFolder);
        return this;
    }

    set animate(b: boolean) {
        this._animate = b;
    }

    get allStreamlines(): Vector[][] {
        return this.streamlines.allStreamlinesSimple;
    }

    get roads(): Vector[][] {
        // For drawing not generation, probably fine to leave map
        return this.streamlines.allStreamlinesSimple.map(s =>
            s.map(v => this.domainController.worldToScreen(v.clone()))
        );
    }

    roadsEmpty(): boolean {
        return this.streamlines.allStreamlinesSimple.length === 0;
    }

    setExistingStreamlines(existingStreamlines: RoadGUI[]): void {
        this.existingStreamlines = existingStreamlines;
    }

    setPreGenerateCallback(callback: () => void): void {
        this.preGenerateCallback = callback;
    }

    setPostGenerateCallback(callback: () => void): void {
        this.postGenerateCallback = callback;
    }

    clearStreamlines(): void {
        this.streamlines.clearStreamlines();
    }

    async generateRoads(bounds?: GenerationBounds, animate=false): Promise<unknown> {
        this.preGenerateCallback();

        const generationBounds = inflateGenerationBounds(this.resolveGenerationBounds(bounds));
        this.setPathIterations(generationBounds.worldDimensions);
        this.streamlines = new StreamlineGenerator(
            this.integrator,
            generationBounds.origin,
            generationBounds.worldDimensions,
            Object.assign({}, this.params));

        for (const s of this.existingStreamlines) {
            this.streamlines.addExistingStreamlines(s.streamlines)   
        }

        this.closeTensorFolder();
        this.redraw();
        
        return this.streamlines.createAllStreamlines(animate).then(() => this.postGenerateCallback());
    }

    /**
     * Returns true if streamlines changes
     */
    update(): boolean {
        return this.streamlines.update();
    }

    protected addDevParamsToFolder(params: StreamlineParams, folder: dat.GUI): void {
        folder.add(params, 'pathIterations');
        folder.add(params, 'seedTries');
        folder.add(params, 'dstep');
        folder.add(params, 'dlookahead');
        folder.add(params, 'dcirclejoin');
        folder.add(params, 'joinangle');
        folder.add(params, 'simplifyTolerance');
        folder.add(params, 'collideEarly');
    }

    /**
     * Sets path iterations so that a road can cover the screen
     */
    protected setPathIterations(worldDimensions: Vector): void {
        this.params.pathIterations = calculatePathIterations(worldDimensions, this.params.dstep);
        Util.updateGui(this.guiFolder);
    }

    protected resolveGenerationBounds(bounds?: GenerationBounds): GenerationBounds {
        if (bounds) {
            return {
                origin: bounds.origin.clone(),
                worldDimensions: bounds.worldDimensions.clone(),
            };
        }

        const viewCenter = this.domainController.origin.add(this.domainController.worldDimensions.divideScalar(2));
        return resolveInitialGenerationBounds({
            viewCenter,
            screenDimensions: this.domainController.screenDimensions,
        });
    }
}
