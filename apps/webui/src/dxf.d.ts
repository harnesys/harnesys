declare module 'dxf' {
  export class Helper {
    constructor(contents: string);
    get parsed(): unknown;
    get denormalised(): unknown;
    toSVG(): string;
    toPolylines(): {
      bbox: { min: { x: number; y: number }; max: { x: number; y: number } };
      polylines: number[][][];
    };
  }
}
