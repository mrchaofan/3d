import "./styles.css";
import * as math from "mathjs";
import fs from "fs";
import path from "path";
import Jimp from "jimp/es/index";

const objFile = fs.readFileSync(path.join(__dirname, "../f-2.obj")).toString();
const texImage = fs.readFileSync(path.join(__dirname, "../f-2/Diffuse.jpg"));

/**
 * @typedef {{
 *  vertices: math.Matrix[]
 *  diffuseTexCoords: math.Matrix[]
 *  faces: number[][]
 * }} MODEL_STRUCT
 */

function getModel(objFile) {
  /**
   * @type {MODEL_STRUCT}
   */
  const ret = {
    vertices: [],
    diffuseTexCoords: [],
    faces: [],
  };
  objFile.split(/\r?\n/).forEach((line) => {
    const cmds = line.split(/\s+/);
    const ctrl = cmds.shift();
    if (ctrl === "v") {
      ret.vertices.push([
        parseFloat(cmds[0]),
        parseFloat(cmds[1]),
        parseFloat(cmds[2]),
      ]);
    } else if (ctrl === "vt") {
      ret.diffuseTexCoords.push([parseFloat(cmds[0]), parseFloat(cmds[1])]);
    } else if (ctrl === "f") {
      const vertData = cmds.map((cmd) =>
        cmd.split("/").map((str) => parseInt(str, 10))
      );
      if (vertData.length === 3) {
        ret.faces.push(vertData);
      } else if (vertData.length === 4) {
        ret.faces.push([vertData[0], vertData[1], vertData[2]]);
        ret.faces.push([vertData[0], vertData[2], vertData[3]]);
      } else if (vertData.length === 5) {
        ret.faces.push([vertData[0], vertData[1], vertData[2]]);
        ret.faces.push([vertData[0], vertData[2], vertData[3]]);
        ret.faces.push([vertData[0], vertData[3], vertData[4]]);
      }
    }
  });
  return ret;
}

Jimp.read(texImage).then((imageData) => {
  new App(getModel(objFile), imageData.bitmap).rasterize();
});

window.math = math;

function clamp(v, a, b) {
  return Math.min(Math.max(v, a), b);
}

class App {
  /**
   *
   * @param {MODEL_STRUCT} modelData
   */
  constructor(modelData, texImage) {
    window.app = this;
    this.texImage = texImage;
    this.modelData = modelData;
    this.canvas = document.createElement("canvas");
    this.context2d = this.canvas.getContext("2d");
    this.progress = document.createElement("div");
    this.width = 800;
    this.height = 600;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.imageData = this.context2d.getImageData(0, 0, this.width, this.height);
    this.fov = Math.PI / 2;
    this.aspect = this.width / this.height;
    this.modelMatrix = math.matrix([
      [400, 0, 0, 0],
      [0, 400, 0, 0],
      [0, 0, 400, 0],
      [0, 0, 0, 1],
    ]);
    this.viewMatrix = math.matrix([
      [0.999323844909668, 0.027219463139772415, 0.024715855717658997, 0],
      [-0.03059154562652111, 0.9884698390960693, 0.14829513430595398, 0],
      [-0.02039436437189579, -0.1489509642124176, 0.9886342883110046, 0],
      [0, 0, -4045.98583984375, 1],
    ]);

    const zFar = 4000;
    const zNear = 100;
    this.prjectionMatrix = math.matrix([
      [math.cot(this.fov / 2) / this.aspect, 0, 0, 0],
      [0, math.cot(this.fov / 2), 0, 0],
      [0, 0, -(zFar + zNear) / (zFar - zNear), -1],
      [0, 0, (-zFar * zNear) / (zFar - zNear), 0],
    ]);
    this.viewPortMatrix = math.matrix([
      [this.width / 2, 0, 0, 0],
      [0, -this.height / 2, 0, 0],
      [0, 0, 1, 0],
      [this.width / 2, this.height / 2, 0, 1],
    ]);
    this.transformMatrix = math.multiply(
      math.multiply(this.modelMatrix, this.viewMatrix),
      this.prjectionMatrix
    );
    document.querySelector("#app").appendChild(this.canvas);
    this.canvas.parentNode.appendChild(this.progress);
  }
  vert(vertData) {
    const xyz = vertData[0];
    const texcoords = vertData[1];
    const vec4 = math.matrix([xyz[0], xyz[1], xyz[2], 1]);
    const ndcVec4 = math.multiply(vec4, this.transformMatrix);
    return [
      [ndcVec4._data[0], ndcVec4._data[1], ndcVec4._data[2], ndcVec4._data[3]],
      texcoords,
    ];
  }
  frag(fragData) {
    const texCoords = fragData[1];
    const textImage = this.texImage;
    const x = Math.floor(textImage.width * texCoords[0]);
    const y = Math.floor(textImage.height * (1 - texCoords[1]));
    const offset = (x + y * textImage.width) * 4;
    return [
      textImage.data[offset],
      textImage.data[offset + 1],
      textImage.data[offset + 2],
      textImage.data[offset + 3],
    ];
  }
  rasterize() {
    const zBuffer = [];
    this.modelData.faces.forEach((face, index, arr) => {
      const vertRet = face.map((vertData) => {
        return this.vert([
          this.modelData.vertices[vertData[0] - 1],
          this.modelData.diffuseTexCoords[vertData[1] - 1],
        ]);
      });
      const vertices = vertRet.map((arr) => arr[0]);
      const texCoords = vertRet.map((arr) => arr[1]);

      const e12 = math.subtract(
        [
          vertices[1][0] / vertices[1][3],
          vertices[1][1] / vertices[1][3],
          vertices[1][2] / vertices[1][3],
        ],
        [
          vertices[0][0] / vertices[0][3],
          vertices[0][1] / vertices[0][3],
          vertices[0][2] / vertices[0][3],
        ]
      );
      const e13 = math.subtract(
        [
          vertices[2][0] / vertices[2][3],
          vertices[2][1] / vertices[2][3],
          vertices[2][2] / vertices[2][3],
        ],
        [
          vertices[0][0] / vertices[0][3],
          vertices[0][1] / vertices[0][3],
          vertices[0][2] / vertices[0][3],
        ]
      );
      const normal = math.cross(e12, e13);

      if (normal[2] < 0) {
        return;
      }

      const screenVertices = vertices.map((vert) => {
        const vec4 = math.matrix(vert);
        const screenCoord = math.multiply(vec4, this.viewPortMatrix);
        return [
          Math.round(screenCoord._data[0] / screenCoord._data[3]),
          Math.round(screenCoord._data[1] / screenCoord._data[3]),
        ];
      });

      const aabb = [
        clamp(
          Math.min(...screenVertices.map((vert) => vert[0])),
          0,
          this.width
        ),
        clamp(
          Math.max(...screenVertices.map((vert) => vert[0])),
          0,
          this.width
        ),
        clamp(
          Math.min(...screenVertices.map((vert) => vert[1])),
          0,
          this.height
        ),
        clamp(
          Math.max(...screenVertices.map((vert) => vert[1])),
          0,
          this.height
        ),
      ];

      for (let i = aabb[0]; i <= aabb[1]; i++) {
        for (let j = aabb[2]; j <= aabb[3]; j++) {
          const pVec3 = math.matrix([i, j, 1]);
          const abc = math.matrix([
            [screenVertices[0][0], screenVertices[0][1], 1],
            [screenVertices[1][0], screenVertices[1][1], 1],
            [screenVertices[2][0], screenVertices[2][1], 1],
          ]);
          if (math.det(abc) === 0) {
            continue;
          }
          const invAbc = math.inv(abc);
          const alphaBetaGrama = math.multiply(pVec3, invAbc);
          const vec3 = [
            alphaBetaGrama._data[0],
            alphaBetaGrama._data[1],
            alphaBetaGrama._data[2],
          ];
          vec3[0] /= vertices[0][3];
          vec3[1] /= vertices[1][3];
          vec3[2] /= vertices[2][3];
          const ratio = vec3[0] + vec3[1] + vec3[2];
          vec3[0] /= ratio;
          vec3[1] /= ratio;
          vec3[2] /= ratio;
          const verticesinterp = math.multiply(
            math.matrix(vec3),
            math.matrix([vertices[0], vertices[1], vertices[2]])
          );
          const texCoordsInterp = math.multiply(
            math.matrix(vec3),
            math.matrix([texCoords[0], texCoords[1], texCoords[2]])
          );
          if (
            vec3[0] < 0 ||
            vec3[1] < 0 ||
            vec3[2] < 0 ||
            verticesinterp._data[2] > zBuffer[i + j * this.width]
          ) {
            continue;
          }
          zBuffer[i + j * this.width] = verticesinterp._data[2];
          const fragResult = this.frag([
            [
              verticesinterp._data[0],
              verticesinterp._data[1],
              verticesinterp._data[2],
              verticesinterp._data[3],
            ],
            [texCoordsInterp._data[0], texCoordsInterp._data[1]],
          ]);
          const offset = (i + j * this.width) * 4;
          this.imageData.data[offset] = fragResult[0];
          this.imageData.data[offset + 1] = fragResult[1];
          this.imageData.data[offset + 2] = fragResult[2];
          this.imageData.data[offset + 3] = fragResult[3];
        }
      }
      this.progress.innerText = (((index + 1) / arr.length) * 100).toFixed(1);
    });
    this.context2d.putImageData(this.imageData, 0, 0);
  }
}

window.foo = [];
