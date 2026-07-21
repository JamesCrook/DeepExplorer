// PathAST has some SVG path commands in it
// It also has the 'end shape' library in it, so we can get < ( and / ends.

// =================== PATH AST UTILITIES ===================

/**
 * @namespace PathAst
 * @description A utility for creating and rendering path ASTs.
 */
const PathAst = (() => {
  /**
   * @function createEmptyPath
   * @description Create an empty path AST.
   * @returns {object} An empty path AST.
   */
  function createEmptyPath() {
    return {
      token: 'compositePath',
      subtree: [],
      value: null,
      jref: 0
    };
  }

  /**
   * @function addPath
   * @description Add a path AST to another path AST.
   * @param {object} targetAst - The target AST.
   * @param {object} sourceAst - The source AST to add.
   * @returns {object} The modified target AST.
   */
  function addPath(targetAst, sourceAst) {
    if(!targetAst.subtree) {
      targetAst.subtree = [];
    }
    targetAst.subtree.push(sourceAst);
    return targetAst;
  }

  /**
   * @function removeMoveTo
   * @description Remove the first MoveTo command from a path AST. Relies on it being the first command.
   * @param {object} pathAst - The path AST to modify.
   * @returns {object} The modified path AST.
   */
  function removeMoveTo(pathAst) {
    if(!pathAst || !pathAst.subtree || !pathAst.subtree[0] || !pathAst
      .subtree[0].subtree) {
      return pathAst;
    }
    // deep copy to be non-destructive
    const newPathAst = JSON.parse(JSON.stringify(pathAst));
    const commands = newPathAst.subtree[0].subtree;

    if(commands.length > 0 && commands[0].token === 'pathCommand' &&
      commands[0].subtree && commands[0].subtree.length > 0 &&
      commands[0].subtree[0].token === 'command' && commands[0].subtree[0]
      .value === 'M') {
      commands.splice(0, 1);
    }
    return newPathAst;
  }

  /**
   * @function createPathCommand
   * @description Create a path command node.
   * @param {string} command - The path command (e.g., 'M', 'L', 'A').
   * @param {...number} numbers - The parameters for the command.
   * @returns {object} A path command node.
   */
  function createPathCommand(command, ...numbers) {
    const subtree = [{
      token: 'command',
      subtree: [],
      value: command,
      jref: 0
    }];

    numbers.forEach((num, index) => {
      if(index > 0) {
        subtree.push({
          token: 'comma',
          subtree: [],
          value: ',',
          jref: 0
        });
      }
      subtree.push({
        token: 'number',
        subtree: [],
        value: num.toString(),
        jref: 0
      });
    });

    return {
      token: 'pathCommand',
      subtree: subtree,
      value: null,
      jref: 0
    };
  }

  /**
   * @function createArc
   * @description Create a basic arc path between two points.
   * @param {Vector2D} center - The center of the arc.
   * @param {number} radius - The radius of the arc.
   * @param {number} startAngle - The starting angle of the arc.
   * @param {number} endAngle - The ending angle of the arc.
   * @param {boolean} [clockwise=false] - Whether the arc should be drawn clockwise.
   * @returns {object} A path AST for the arc.
   */
  function createArc(center, radius, startAngle, endAngle, clockwise =
    false) {
    if(radius <= 0) {
      return createEmptyPath();
    }

    const startPoint = center.add(Vector2D.fromPolar(radius, startAngle));
    const endPoint = center.add(Vector2D.fromPolar(radius, endAngle));

    // Calculate arc parameters for SVG
    const largeArcFlag = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
    const sweepFlag = clockwise ? 1 : 0;

    const path = createEmptyPath();
    addPath(path, createPathCommand('M', startPoint.x, startPoint.y));
    addPath(path, createPathCommand('A', radius, radius, 0, largeArcFlag,
      sweepFlag, endPoint.x, endPoint.y));

    return path;
  }

  /**
   * @function createLinePath
   * @description Create a straight line path between points.
   * @param {Vector2D[]} points - An array of points.
   * @returns {object} A path AST for the line.
   */
  function createLinePath(points) {
    if(points.length < 2) return createEmptyPath();

    const path = createEmptyPath();
    addPath(path, createPathCommand('M', points[0].x, points[0].y));

    for(let i = 1; i < points.length; i++) {
      addPath(path, createPathCommand('L', points[i].x, points[i].y));
    }

    return path;
  }

  // =================== END SHAPE LIBRARY ===================

  const EndShapeLibrary = {
    /**
     * @function EndShapeLibrary.[']
     * @description Flat end - just a straight line.
     */
    '[': function(point1, point2, tangentAngle, halfWidth, slantAngle) {
      return createLinePath([point1, point2]);
    },

    /**
     * @function EndShapeLibrary.']']
     * @description Flat end - just a straight line.
     */
    ']': function(point1, point2, tangentAngle, halfWidth, slantAngle) {
      return createLinePath([point1, point2]);
    },

    /**
     * @function EndShapeLibrary.['<']
     * @description Chevron/arrow end - creates a point.
     */
    '<': function(point1, point2, tangentAngle, halfWidth, slantAngle) {
      const midPoint = point1.add(point2).scale(0.5);
      const slantOffset = Math.tan(slantAngle) * halfWidth;
      const tangentVector = Vector2D.fromAngle(tangentAngle);
      const slantVector = Vector2D.fromAngle(tangentAngle - Math.PI / 2)
        .scale(slantOffset);
      const chevronPoint = midPoint.add(tangentVector.scale(-halfWidth))
        .add(slantVector);

      return createLinePath([point1, chevronPoint, point2]);
    },

    /**
     * @function EndShapeLibrary.['>']
     * @description Chevron/arrow end - creates a point.
     */
    '>': function(point1, point2, tangentAngle, halfWidth, slantAngle) {
      const midPoint = point1.add(point2).scale(0.5);
      const slantOffset = Math.tan(slantAngle) * halfWidth;
      const tangentVector = Vector2D.fromAngle(tangentAngle);
      const slantVector = Vector2D.fromAngle(tangentAngle - Math.PI / 2)
        .scale(slantOffset);
      const chevronPoint = midPoint.add(tangentVector.scale(halfWidth))
        .add(slantVector);

      return createLinePath([point1, chevronPoint, point2]);
    },

    /**
     * @function EndShapeLibrary.['(']
     * @description Parenthesis/curved end - half circle.
     */
    '(': function(point1, point2, tangentAngle, halfWidth, slantAngle) {
      const midPoint = point1.add(point2).scale(0.5);
      const vec = point2.subtract(point1);
      const tangentVector = Vector2D.fromAngle(tangentAngle);
      const clockwise = vec.perpendicular().dot(tangentVector) > 0 ? 0 :
        1;
      const distance = vec.length;
      const radius = distance / 2;
      //const perpAngle = vec.angle + Math.PI / 2;

      //const startAngle = perpAngle + Math.PI / 2 - slantAngle;
      //const endAngle = perpAngle - Math.PI / 2 - slantAngle;
      const path = createEmptyPath();
      addPath(path, createPathCommand('M', point1.x, point1.y));
      addPath(path, createPathCommand('A', radius, radius, 0, 0,
        clockwise, point2.x, point2.y));

      return path;
    },

    /**
     * @function EndShapeLibrary.[')']
     * @description Parenthesis/curved end - half circle.
     */
    ')': function(point1, point2, tangentAngle, halfWidth, slantAngle) {
      const midPoint = point1.add(point2).scale(0.5);
      const vec = point2.subtract(point1);
      const tangentVector = Vector2D.fromAngle(tangentAngle);
      const clockwise = vec.perpendicular().dot(tangentVector) > 0 ? 1 :
        0;
      const distance = vec.length;
      const radius = distance / 2;
      //const perpAngle = vec.angle + Math.PI / 2;

      //const startAngle = perpAngle + Math.PI / 2 + slantAngle;
      //const endAngle = perpAngle - Math.PI / 2 + slantAngle;

      const path = createEmptyPath();
      addPath(path, createPathCommand('M', point1.x, point1.y));
      addPath(path, createPathCommand('A', radius, radius, 0, 0,
        clockwise, point2.x, point2.y));

      return path;
    }
  };

  /**
   * @function registerEndShape
   * @description Register a new end shape in the library.
   * @param {string} symbol - The symbol for the end shape.
   * @param {function} shapeFunction - The function to create the end shape.
   */
  function registerEndShape(symbol, shapeFunction) {
    EndShapeLibrary[symbol] = shapeFunction;
  }

  /**
   * @function createEndShape
   * @description Create an end shape path.
   * @param {string} endType - The type of end shape.
   * @param {Vector2D} point1 - The first point of the end shape.
   * @param {Vector2D} point2 - The second point of the end shape.
   * @param {number} tangentAngle - The angle of the tangent.
   * @param {number} halfWidth - Half the width of the end shape.
   * @param {number} slantAngle - The angle of the slant.
   * @returns {object} A path AST for the end shape.
   */
  function createEndShape(endType, point1, point2, tangentAngle, halfWidth,
    slantAngle) {
    // if end shape is not found, silently use the flat shape.
    const shapeFunction = EndShapeLibrary[endType] || EndShapeLibrary['['];
    return shapeFunction(point1, point2, tangentAngle, halfWidth,
      slantAngle);
  }

  function getEndShapes() {
    return Object.keys(EndShapeLibrary);
  }

  /**
   * @function findParentOf
   * @description Helper function to find parent of a node in AST.
   * @param {object} ast - The AST to search.
   * @param {object} targetNode - The node to find the parent of.
   * @returns {object|null} The parent node or null if not found.
   */
  function findParentOf(ast, targetNode) {
    if(ast.subtree) {
      for(let child of ast.subtree) {
        if(child === targetNode) {
          return ast;
        }
        const found = findParentOf(child, targetNode);
        if(found) return found;
      }
    }
    return null;
  }

  /**
   * @function calculateArcStrokeGeometry
   * @description Calculate the geometry for stroking an arc.
   * @param {Vector2D} p1 - The start point of the arc.
   * @param {Vector2D} p2 - The end point of the arc.
   * @param {object} style - The style of the arc.
   * @returns {object} The geometry of the arc stroke.
   */
  function calculateArcStrokeGeometry(p1, p2, style) {
    let {
      angle = 0,
        width = 20,
        startEndType = '[',
        endEndType = ']',
        startSlant = 0,
        endSlant = 0
    } = style;

    // Get the parameters of the centre line
    let {
      angleRad,
      radius,
      center,
      startAngle,
      endAngle
    } = GeometryUtils.calcAngles(angle, p1, p2);

    const halfWidth = width / 2;
    const firstRadius = Math.abs(radius - halfWidth);
    const secondRadius = Math.abs(radius + halfWidth);

    // The key fix: determine if we're curving left or right
    const isNegativeCurve = angle < 0;

    // Calculate slant offsets
    const startSlantRad = startSlant * Math.PI / 180;
    const endSlantRad = endSlant * Math.PI / 180;
    const startOffsetX = Math.sin(startSlantRad) * halfWidth * 2;
    const endOffsetX = Math.sin(endSlantRad) * halfWidth * 2;
    const startSlantOffsetAngle = Math.atan2(startOffsetX, firstRadius);
    const endSlantOffsetAngle = Math.atan2(endOffsetX, firstRadius);

    // For negative curves, we need to adjust the angle calculations
    let tangentAngle1, tangentAngle2;
    if(isNegativeCurve) {
      tangentAngle1 = startAngle - Math.PI / 2;
      tangentAngle2 = endAngle - Math.PI / 2;
    } else {
      tangentAngle1 = startAngle + Math.PI / 2;
      tangentAngle2 = endAngle + Math.PI / 2;
    }

    // Calculate the four corner points
    let firstStart, firstEnd, secondStart, secondEnd;

    if(isNegativeCurve) {
      // For negative curves, the "first" radius is actually the outer radius
      firstStart = center.add(Vector2D.fromPolar(firstRadius, startAngle -
        startSlantOffsetAngle));
      firstEnd = center.add(Vector2D.fromPolar(firstRadius, endAngle +
        endSlantOffsetAngle));
      secondStart = center.add(Vector2D.fromPolar(secondRadius, startAngle +
        startSlantOffsetAngle));
      secondEnd = center.add(Vector2D.fromPolar(secondRadius, endAngle -
        endSlantOffsetAngle));
    } else {
      // For positive curves, original calculation
      firstStart = center.add(Vector2D.fromPolar(firstRadius, startAngle +
        startSlantOffsetAngle));
      firstEnd = center.add(Vector2D.fromPolar(firstRadius, endAngle -
        endSlantOffsetAngle));
      secondStart = center.add(Vector2D.fromPolar(secondRadius, startAngle -
        startSlantOffsetAngle));
      secondEnd = center.add(Vector2D.fromPolar(secondRadius, endAngle +
        endSlantOffsetAngle));
    }

    return {
      angle,
      width,
      startEndType,
      endEndType,
      startSlant,
      endSlant,
      angleRad,
      radius,
      center,
      startAngle,
      endAngle,
      halfWidth,
      tangentAngle1,
      tangentAngle2,
      startSlantRad,
      endSlantRad,
      firstRadius,
      secondRadius,
      startOffsetX,
      endOffsetX,
      startSlantOffsetAngle,
      endSlantOffsetAngle,
      firstStartAngle: isNegativeCurve ? startAngle -
        startSlantOffsetAngle : startAngle + startSlantOffsetAngle,
      firstEndAngle: isNegativeCurve ? endAngle + endSlantOffsetAngle :
        endAngle - endSlantOffsetAngle,
      secondStartAngle: isNegativeCurve ? startAngle +
        startSlantOffsetAngle : startAngle - startSlantOffsetAngle,
      secondEndAngle: isNegativeCurve ? endAngle - endSlantOffsetAngle :
        endAngle + endSlantOffsetAngle,
      firstStart,
      firstEnd,
      secondStart,
      secondEnd,
      isNegativeCurve // Add this flag for use in arc creation
    };
  }

  function getArcRectanglePieces(p1, p2, style) {
    const g = calculateArcStrokeGeometry(p1, p2, style);

    // Add start end shape
    const startEndPath = {
      token: 'startEndShape',
      subtree: [createEndShape(g.startEndType, g.firstStart, g
        .secondStart,
        g.tangentAngle1, g.halfWidth, g.startSlantRad)],
      value: null,
      jref: 0
    };

    // Add second arc - clockwise direction depends on curve direction
    const secondCurvePath = {
      token: 'secondArc',
      subtree: [createArc(g.center, g.secondRadius, g.secondStartAngle, g
        .secondEndAngle, g.isNegativeCurve
      )], // Flip clockwise for negative curves
      value: null,
      jref: 0
    };

    // Add end end shape
    const endEndPath = {
      token: 'endEndShape',
      subtree: [createEndShape(g.endEndType, g.secondEnd, g.firstEnd, g
        .tangentAngle2 + Math.PI, g.halfWidth, g.endSlantRad)],
      value: null,
      jref: 0
    };

    // Add first arc (return path) - opposite direction to second arc
    const firstCurvePath = {
      token: 'firstArc',
      subtree: [createArc(g.center, g.firstRadius, g.firstEndAngle, g
        .firstStartAngle, !g.isNegativeCurve
      )], // Flip clockwise for negative curves
      value: null,
      jref: 0
    };

    return [startEndPath, secondCurvePath, endEndPath, firstCurvePath];
  }

  function createArcRectanglePath(p1, p2, style) {
    const pieces = getArcRectanglePieces(p1, p2, style)
    return combinePieces(pieces);
  }

  function combinePieces(pieces) {
    const compositePath = createEmptyPath();
    addPath(compositePath, pieces[0]); // Keep the M
    addPath(compositePath, removeMoveTo(pieces[1]));
    addPath(compositePath, removeMoveTo(pieces[2]));
    addPath(compositePath, removeMoveTo(pieces[3]));

    // Close the path
    const closePath = createPathCommand('Z');
    addPath(compositePath, closePath);

    return compositePath;
  }

  function calculateSplineStrokeGeometry(p1, p2, style) {
    const {
      width = 20,
        startEndType = '[',
        endEndType = ']',
        startSlant = 0,
        endSlant = 0,
        startTangent,
        endTangent,
    } = style;

    const halfWidth = width / 2;

    const startNormal = startTangent.perpendicular();
    const endNormal = endTangent.perpendicular();

    const outerStart = p1.subtract(startNormal.scale(halfWidth));
    const innerStart = p1.add(startNormal.scale(halfWidth));
    const outerEnd = p2.subtract(endNormal.scale(halfWidth));
    const innerEnd = p2.add(endNormal.scale(halfWidth));

    const distFactor = style.diversionFactor || DIVERSION_FACTOR;

    let dist
    dist = outerStart.distanceTo(outerEnd) * distFactor;
    const outerCp1 = outerStart.add(startTangent.scale(dist));
    const outerCp2 = outerEnd.subtract(endTangent.scale(dist));

    dist = innerStart.distanceTo(innerEnd) * distFactor;
    const innerCp1 = innerStart.add(startTangent.scale(dist));
    const innerCp2 = innerEnd.subtract(endTangent.scale(dist));

    return {
      width,
      startEndType,
      endEndType,
      startSlant,
      endSlant,
      halfWidth,
      outerStart,
      innerStart,
      outerEnd,
      innerEnd,
      outerCp1,
      outerCp2,
      innerCp1,
      innerCp2,
      tangentAngle1: startTangent.angle,
      tangentAngle2: endTangent.angle,
      startSlantRad: startSlant * Math.PI / 180,
      endSlantRad: endSlant * Math.PI / 180,
    };
  }

  function getSplineRectanglePieces(p1, p2, style) {
    const g = calculateSplineStrokeGeometry(p1, p2, style);
    const compositePath = createEmptyPath();

    const startEndPath = {
      token: 'startEndShape',
      subtree: [createEndShape(g.startEndType, g.innerStart, g.outerStart,
        g.tangentAngle1, g.halfWidth, g.startSlantRad)],
      value: null,
      jref: 0
    };

    const outerCurve = createEmptyPath();
    addPath(outerCurve, createPathCommand('M', g.outerStart.x, g.outerStart
      .y));
    addPath(outerCurve, createPathCommand('C', g.outerCp1.x, g.outerCp1.y, g
      .outerCp2.x, g.outerCp2.y, g.outerEnd.x, g.outerEnd.y));
    const outerCurvePath = {
      token: 'outerCurve',
      subtree: [outerCurve],
      value: null,
      jref: 0
    };

    const endEndPath = {
      token: 'endEndShape',
      subtree: [createEndShape(g.endEndType, g.outerEnd, g.innerEnd, g
        .tangentAngle2 + Math.PI, g.halfWidth, g.endSlantRad)],
      value: null,
      jref: 0
    };

    const innerCurve = createEmptyPath();
    addPath(innerCurve, createPathCommand('M', g.innerEnd.x, g.innerEnd.y));
    addPath(innerCurve, createPathCommand('C', g.innerCp2.x, g.innerCp2.y, g
      .innerCp1.x, g.innerCp1.y, g.innerStart.x, g.innerStart.y));
    const innerCurvePath = {
      token: 'innerCurve',
      subtree: [innerCurve],
      value: null,
      jref: 0
    };
    return [startEndPath, outerCurvePath, endEndPath, innerCurvePath];
  }

  function createSplineRectanglePath(p1, p2, style) {
    const pieces = getSplineRectanglePieces(p1, p2, style)
    return combinePieces(pieces);
  }

  function toSVGPathString(pathAst) {
    if(!pathAst || !pathAst.subtree) return "";
    let svgString = "";

    function executePathCommands(node, isSubPath) {
      if(node.token === 'command') {
        const command = node.value;
        if(isSubPath && command === 'M') {
          // Skip MoveTo for subpaths, assume it's connected
        } else {
          const numbers = [];
          let parent = findParentOf(pathAst, node);
          if(parent) {
            let foundCommand = false;
            for(let sibling of parent.subtree) {
              if(sibling === node) {
                foundCommand = true;
                continue;
              }
              if(foundCommand && sibling.token === 'number') {
                numbers.push(parseFloat(sibling.value));
              }
              if(foundCommand && sibling.token === 'command') {
                break;
              }
            }
          }
          svgString += command + " " + numbers.join(" ") + " ";
        }
      }
      if(node.subtree) {
        for(let i = 0; i < node.subtree.length; i++) {
          executePathCommands(node.subtree[i], isSubPath || i > 0);
        }
      }
    }

    executePathCommands(pathAst, false);
    return svgString.trim();
  }

  return {
    createEmptyPath,
    addPath,
    removeMoveTo,
    createPathCommand,
    createArc,
    createLinePath,
    registerEndShape,
    createEndShape,
    getEndShapes,
    toSVGPathString,
    calculateArcStrokeGeometry,
    createArcRectanglePath,
    getArcRectanglePieces: getArcRectanglePieces,
    calculateSplineStrokeGeometry,
    createSplineRectanglePath,
    getSplineRectanglePieces: getSplineRectanglePieces,
  }
})();

const PathToContext = (() => {
  /**
   * @function findParentOf
   * @description Helper function to find parent of a node in AST.
   * @param {object} ast - The AST to search.
   * @param {object} targetNode - The node to find the parent of.
   * @returns {object|null} The parent node or null if not found.
   */
  function findParentOf(ast, targetNode) {
    if(ast.subtree) {
      for(let child of ast.subtree) {
        if(child === targetNode) {
          return ast;
        }
        const found = findParentOf(child, targetNode);
        if(found) return found;
      }
    }
    return null;
  }

  /**
   * @function _calculateArcParameters
   * @description Calculate arc parameters from SVG arc command.
   * @param {number} currentX - Current X position.
   * @param {number} currentY - Current Y position.
   * @param {number} rx - X radius.
   * @param {number} ry - Y radius.
   * @param {number} xAxisRotation - Rotation of the ellipse.
   * @param {number} largeArcFlag - Large arc flag (0 or 1).
   * @param {number} sweepFlag - Sweep direction flag (0 or 1).
   * @param {number} x - End X position.
   * @param {number} y - End Y position.
   * @returns {object} Arc parameters for canvas arc() method.
   */
  function _calculateArcParameters(currentX, currentY, rx, ry,
    xAxisRotation,
    largeArcFlag, sweepFlag, x, y) {
    // Use the larger radius for circular arc approximation
    const radius = Math.max(rx, ry);
    // Calculate the proper arc center using geometry
    const p1 = new Vector2D(currentX, currentY);
    const p2 = new Vector2D(x, y);

    const distance = p1.distanceTo(p2);
    // Calculate how far the center is from the midpoint
    const halfChord = distance / 2;
    if(radius <= halfChord) {
      // Radius too small, draw straight line
      return {
        type: 'line',
        x,
        y
      };
    }

    const midpoint = p1.add(p2).scale(0.5);
    const perpendicular = p2.subtract(p1).perpendicular().normalize();

    const centerDistance = Math.sqrt(radius * radius - halfChord *
      halfChord);

    // Choose which side of the line based on sweep direction
    const sign = sweepFlag ? -1 : 1;
    const center = midpoint.add(perpendicular.scale(sign * centerDistance));

    // Calculate start and end angles
    let startAngle = Math.atan2(currentY - center.y, currentX - center.x);
    let endAngle = Math.atan2(y - center.y, x - center.x);

    if(false && sweepFlag !== 1) {
      let t = startAngle;
      startAngle = endAngle;
      endAngle = t;
      sweepFlag = 1
    }

    return {
      type: 'arc',
      centerX: center.x,
      centerY: center.y,
      radius: radius,
      startAngle: startAngle,
      endAngle: endAngle,
      anticlockwise: sweepFlag === 1,
      endX: x,
      endY: y
    };
  }

  /**
   * @function pathToContext
   * @description Applies the pathAst to the canvas, but doesn't style it.
   * @param {object} pathAst - The path AST to render.
   * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
   * @param {object} [style={}] - The style to apply to the path.
   */
  function pathToContext(pathAst, ctx, style = {}) {
    if(!pathAst || !pathAst.subtree) return;

    ctx.currentX = 0;
    ctx.currentY = 0;

    // Walk the AST and execute path commands
    function executePathCommands(node) {
      if(node.token === 'command') {
        const command = node.value;
        const numbers = [];

        // Collect numbers from siblings
        let parent = findParentOf(pathAst, node);
        if(parent) {
          let foundCommand = false;
          for(let sibling of parent.subtree) {
            if(sibling === node) {
              foundCommand = true;
              continue;
            }
            if(foundCommand && sibling.token === 'number') {
              numbers.push(parseFloat(sibling.value));
            }
            if(foundCommand && sibling.token === 'command') {
              break; // Next command
            }
          }
        }

        // Execute canvas command
        switch(command) {
          case 'M':
            if(numbers.length >= 2) {
              ctx.moveTo(numbers[0], numbers[1]);
              ctx.currentX = numbers[0];
              ctx.currentY = numbers[1];
            }
            break;
          case 'L':
            if(numbers.length >= 2) {
              ctx.lineTo(numbers[0], numbers[1]);
              ctx.currentX = numbers[0];
              ctx.currentY = numbers[1];
            }
            break;
          case 'C':
            if(numbers.length >= 6) {
              ctx.bezierCurveTo(numbers[0], numbers[1], numbers[2], numbers[
                3], numbers[4], numbers[5]);
              ctx.currentX = numbers[4];
              ctx.currentY = numbers[5];
            }
            break;
          case 'A':
            if(numbers.length >= 7) {
              // SVG arc: A rx ry x-axis-rotation large-arc-flag sweep-flag x y
              const [rx, ry, xAxisRotation, largeArcFlag, sweepFlag, x, y] =
              numbers;

              // Get current point
              const currentX = ctx.currentX || 0;
              const currentY = ctx.currentY || 0;

              // Calculate arc parameters
              const arcParams = _calculateArcParameters(
                currentX, currentY, rx, ry, xAxisRotation, largeArcFlag,
                sweepFlag, x, y
              );

              if(arcParams.type === 'arc') {
                ctx.arc(
                  arcParams.centerX,
                  arcParams.centerY,
                  arcParams.radius,
                  arcParams.startAngle,
                  arcParams.endAngle,
                  arcParams.anticlockwise
                );
              } else {
                // Fall back to line
                ctx.lineTo(arcParams.x, arcParams.y);
              }

              // Update current position
              ctx.currentX = x;
              ctx.currentY = y;
            }
            break;
          case 'Z':
            ctx.closePath();
            break;
        }
      }

      // Recurse into children
      if(node.subtree) {
        for(let child of node.subtree) {
          executePathCommands(child);
        }
      }
    }

    executePathCommands(pathAst);

    // Ensure path is closed for proper filling
    ctx.closePath();
  }

  // The path has already been traced on the context, so now
  // stroke and fill. 
  function applyStyleToContext(ctx, style = {}, p1, p2) {
    // The tests for style.layer fill and outline are naff, and probably we
    // should have set fill/outline to '#0000' earlier in the sequence.
    // Apply styling - fill first, then stroke
    if(style.fill && style.fill !== '#0000' && style?.layer?.fill !==
      false) {
      let gradient = style.fill;
      if(Array.isArray(style.fill)) {
        gradient = style.fill[0];
        if(p1 && p2) {
          const totalLength = p1.distanceTo(p2);
          let colorStopOffset = (style.width || 20);
          colorStopOffset = Math.min(totalLength / 2.5, colorStopOffset);
          colorStopOffset = colorStopOffset / totalLength;
          if(0.0 <= colorStopOffset && colorStopOffset < 1.0) {
            gradient = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
            gradient.addColorStop(0, style.fill[0]);
            gradient.addColorStop(colorStopOffset, style.fill[0]);
            gradient.addColorStop(1 - colorStopOffset, style.fill[style.fill
              .length - 1]);
            gradient.addColorStop(1, style.fill[style.fill.length - 1]);
          }
        }
      }
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    if(style.outline && style.outline !== '#0000' && style?.layer
      ?.outline !== false) {
      ctx.strokeStyle = style.outline;
      ctx.lineWidth = style.lineWidth || 2;
      ctx.stroke();
    }

  }

  // draws the path pieces and then applies the fill and outline properties.
  function drawStyledPaths(pathAst, ctx, style = {}, p1, p2) {
    ctx.save();
    ctx.globalAlpha = style.globalAlpha || 1.0;
    ctx.beginPath();
    if(!Array.isArray(pathAst))
      pathAst = [pathAst]
    for(const path of pathAst)
      pathToContext(path, ctx, style);
    applyStyleToContext(ctx, style, p1, p2)
    ctx.restore();
  }

  return {
    drawStyledPaths,
    pathToContext,
    applyStyleToContext,
  }
})();

// =================== USAGE EXAMPLES ===================

/*


// Example: Get just the end shapes from an arc rectangle
const arcPath = PathAst.createArcRectanglePath(p1, p2, style);
const startShapes = arcPath.subtree.filter(node => node.token === 'startEndShape');
const endShapes = arcPath.subtree.filter(node => node.token === 'endEndShape');

// Example: Render only the main arcs, skip end shapes
function renderMainArcsOnly(pathAst, ctx, style) {
  const mainArcs = pathAst.subtree.filter(node => 
  node.token === 'outerArc' || node.token === 'innerArc'
  );
  
  mainArcs.forEach(arc => PathToContext.drawStyledPaths(arc, ctx, style));
}
*/

window.PathAst = PathAst;
window.PathToContext  = PathToContext ;
// Auto-generated exports
export { PathAst };
export { PathToContext };
