/*
 * File: RGraph.js
 *
 */

/*
 Class: RGraph

 A radial graph visualization with advanced animations.

 Inspired by:

 Animated Exploration of Dynamic Graphs with Radial Layout (Ka-Ping Yee, Danyel Fisher, Rachna Dhamija, Marti Hearst) <http://bailando.sims.berkeley.edu/papers/infovis01.htm>

 Note:

 This visualization was built and engineered from scratch, taking only the paper as inspiration, and only shares some features with the visualization described in the paper.

 Implements:

 All <Loader> methods

 Constructor Options:

 Inherits options from

 - <Options.Canvas>
 - <Options.Controller>
 - <Options.Node>
 - <Options.Edge>
 - <Options.Label>
 - <Options.Events>
 - <Options.Tips>
 - <Options.NodeStyles>
 - <Options.Navigation>

 Additionally, there are other parameters and some default values changed

  constrained - (boolean) Default's *false*. Whether to show the entire radial graph when loaded or just the number of circles specified by _numberOfCircles_.
 interpolation - (string) Default's *linear*. Describes the way nodes are interpolated. Possible values are 'linear' and 'polar'.
 levelDistance - (number) Default's *100*. The distance between levels of the tree.
 radialExponent - (number) Default's *1.0*. The exponent for radial distance.
 numberOfCircles - (number) Default's *6*. The number of circles a.k.a. depth to show.

 Instance Properties:

 canvas - Access a <Canvas> instance.
 graph - Access a <Graph> instance.
 op - Access a <RGraph.Op> instance.
 fx - Access a <RGraph.Plot> instance.
 labels - Access a <RGraph.Label> interface implementation.
 */

$jit.RGraph = new Class( {

    Implements: [
        Loader, Extras, Layouts.Radial
    ],

    initialize: function(controller){
        var $RGraph = $jit.RGraph;

        var config = {
            constrained: false,
            interpolation: 'linear',
            levelDistance: 100,
            radialExponent: 1.0,
            numberOfCircles: 6
        };

        this.controller = this.config = $.merge(Options("Canvas", "Node", "Edge",
            "Fx", "Controller", "Tips", "NodeStyles", "Events", "Navigation", "Label"), config, controller);

        var canvasConfig = this.config;
        if(canvasConfig.useCanvas) {
            this.canvas = canvasConfig.useCanvas;
            this.config.labelContainer = this.canvas.id + '-label';
        } else {
            if(canvasConfig.background) {
                canvasConfig.background = $.merge({
                    type: 'Circles',
                    levelDistance: this.config.levelDistance,
                    radialExponent: this.config.radialExponent,
                    numberOfCircles: this.config.numberOfCircles
                }, canvasConfig.background);
            }
            this.canvas = new Canvas(this, canvasConfig);
            this.config.labelContainer = (typeof canvasConfig.injectInto == 'string'? canvasConfig.injectInto : canvasConfig.injectInto.id) + '-label';
        }

        this.graphOptions = {
            'klass': Polar,
            'Node': {
                'selected': false,
                'exist': true,
                'drawn': true
            }
        };
        this.graph = new Graph(this.graphOptions, this.config.Node,
            this.config.Edge);
        this.labels = new $RGraph.Label[canvasConfig.Label.type](this);
        this.fx = new $RGraph.Plot(this, $RGraph);
        this.op = new $RGraph.Op(this);
        this.json = null;
        this.root = null;
        this.busy = false;
        this.parent = false;
        // initialize extras
        this.initializeExtras();
    },

  /*
   * Method: compute
   * 
   * Computes nodes' positions and constrains.
   * 
   * Parameters:
   * 
   * property - _optional_ A <Graph.Node> position property to store the new
   * positions. Possible values are 'pos', 'end' or 'start'.
   * 
   */
  compute : function(property) {
    var prop = $.splat(property || [ 'current', 'start', 'end' ]);
    NodeDim.compute(this.graph, prop, this.config);
    this.graph.computeLevels(this.root, 0, "ignore");
    var lengthFunc = this.createLevelDistanceFunc(); 
    this.computeScales(prop);
    this.computeAngularWidths(prop);
    this.computePositions(prop, lengthFunc);
  },

  computeScales: function(propArray) {
    var that = this;
    this.graph.eachNode(function(elem) {
        var sc = Math.pow(that.config.radialExponent, elem._depth);
        for ( var i=0, l=propArray.length; i < l; i++) {
          var pi = propArray[i];
          elem.setData("scale", sc, pi);
          //elem.drawn = (elem._depth <= that.config.numberOfCircles);
        }
    }, "ignore");
  },

    /*

     createLevelDistanceFunc

     Returns the levelDistance function used for calculating a node distance
     to its origin. This function returns a function that is computed
     per level and not per node, such that all nodes with the same depth will have the
     same distance to the origin. The resulting function gets the
     parent node as parameter and returns a float.

     */
    createLevelDistanceFunc: function(){
        var cnf = this.config;
        return function(elem){
            return Math.pow((elem._depth+1) * cnf.levelDistance, cnf.radialExponent);
        };
    },

    /*
     * Method: setSubtreeAngularWidth
     * 
     * Sets the angular width for a subtree. Overridden to take numberOfCircles into account.
     */
    setSubtreeAngularWidth : function(elem) {
      var that = this, cnf = this.config, nodeAW = elem._angularWidth, sumAW = 0;
      elem.eachSubnode(function(child) {
        that.setSubtreeAngularWidth(child);
        if ((!cnf.constrained) || (elem._depth < cnf.numberOfCircles))
          sumAW += child._treeAngularWidth;
      }, "ignore");
      elem._treeAngularWidth = Math.max(nodeAW, sumAW);
    },

  /*
   * Method: setNodePositionAndAngleSpan
   *
   * Sets a node's position and angle span.
   */
  setNodePositionAndAngleSpan: function(parent, elem, props, pos, span, angleSpan) {
    var cnf = this.config;
    if ((parent) && (cnf.constrained) && (elem._depth > cnf.numberOfCircles)) {
        elem.angleSpan = parent.angleSpan;
        for ( var i=0, l=props.length; i < l; i++) {
          var pi = props[i];
          elem.setPos(parent.getPos(pi), pi);
          elem.setData('span', parent.getData('span', pi), pi);
        }
    } else {
        elem.angleSpan = angleSpan;
        for ( var i=0, l=props.length; i < l; i++) {
          var pi = props[i];
          elem.setPos(pos, pi);
          elem.setData('span', span, pi);
        }
    }
  },

  /*
   * Method: getNodeDimensions
   * 
   * Retrieves the node's dimensions for a given property. This method can be
   * overridden in case a different dimension shall be used for the calculation.
   */
  getNodeDimensions: function(elem, prop) {
    return elem.getData('dim', prop) * elem.getData('scale', prop);
  },

    /*
     Method: refresh 

     Computes positions and plots the tree.

     */
    refresh: function(){
        this.compute();
        this.plot();
    },

    reposition: function(){
        this.compute('end');
    },

    /*
     Method: plot

     Plots the RGraph. This is a shortcut to *fx.plot*.
     */
    plot: function(){
        this.fx.plot();
    },

    /*
     getNodeAndParentAngle

     Returns the _parent_ of the given node, also calculating its angle span.
     */
    getNodeAndParentAngle: function(id){
        var theta = false;
        var n = this.graph.getNode(id);
        var ps = n.getParents();
        var p = (ps.length > 0)? ps[0] : false;
        if (p) {
            var posParent = p.pos.getc(), posChild = n.pos.getc();
            var newPos = posParent.add(posChild.scale(-1));
            theta = Math.atan2(newPos.y, newPos.x);
            if (theta < 0)
                theta += 2 * Math.PI;
        }
        return {
            parent: p,
            theta: theta
        };
    },

    /*
     tagChildren

     Enumerates the children in order to maintain child ordering (second constraint of the paper).
     */
    tagChildren: function(par, id){
        if (par.angleSpan) {
            var adjs = [];
            par.eachAdjacency(function(elem){
                adjs.push(elem.nodeTo);
            }, "ignore");
            var len = adjs.length;
            for ( var i = 0; i < len && id != adjs[i].id; i++)
                ;
            for ( var j = (i + 1) % len, k = 0; id != adjs[j].id; j = (j + 1) % len) {
                adjs[j].dist = k++;
            }
        }
    },

    /*
     Method: onClick

     Animates the <RGraph> to center the node specified by *id*.

     Parameters:

     id - A <Graph.Node> id.
     opt - (optional|object) An object containing some extra properties described below
     hideLabels - (boolean) Default's *true*. Hide labels when performing the animation.

     Example:

     (start code js)
     rgraph.onClick('someid');
     //or also...
     rgraph.onClick('someid', {
     hideLabels: false
     });
     (end code)

     */
    onClick: function(id, opt){
        if (this.root != id && !this.busy) {
            this.busy = true;
            this.root = id;
            var that = this;
            this.controller.onBeforeCompute(this.graph.getNode(id));
            var obj = this.getNodeAndParentAngle(id);

            // second constraint
            this.tagChildren(obj.parent, id);
            this.parent = obj.parent;
            this.compute('end');

            // first constraint
            var thetaDiff = obj.theta - obj.parent.endPos.theta;
            this.graph.eachNode(function(elem){
                elem.endPos.set(elem.endPos.getp().add($P(thetaDiff, 0)));
            });

            var mode = this.config.interpolation;
            opt = $.merge( {
                onComplete: $.empty
            }, opt || {});

            this.fx.animate($.merge( {
                hideLabels: true,
                modes: [
                    mode, 'node-property:scale'
                ]
            }, opt, {
                onComplete: function(){
                    that.busy = false;
                    opt.onComplete();
                }
            }));
        }
    }
});

$jit.RGraph.$extend = true;

(function(RGraph){

    /* helper function to determine scaling */
    function radialScale(pos, cnf) {
        if (cnf.radialExponent == 1.0) return 1.0;
        var rho = pos.getp(true).rho,
            r = Math.pow(rho, 1.0/cnf.radialExponent);
        return Math.pow(cnf.radialExponent, r / cnf.levelDistance);
    }

    /*
     Class: RGraph.Op

     Custom extension of <Graph.Op>.

     Extends:

     All <Graph.Op> methods

     See also:

     <Graph.Op>

     */
    RGraph.Op = new Class( {

        Implements: Graph.Op

    });

    /*
     Class: RGraph.Plot

     Custom extension of <Graph.Plot>.

     Extends:

     All <Graph.Plot> methods

     See also:

     <Graph.Plot>

     */
    RGraph.Plot = new Class( {

        Implements: Graph.Plot

    });

    /*
     Object: RGraph.Label

     Custom extension of <Graph.Label>.
     Contains custom <Graph.Label.SVG>, <Graph.Label.HTML> and <Graph.Label.Native> extensions.

     Extends:

     All <Graph.Label> methods and subclasses.

     See also:

     <Graph.Label>, <Graph.Label.Native>, <Graph.Label.HTML>, <Graph.Label.SVG>.

     */
    RGraph.Label = {};

    /*
     RGraph.Label.Native

     Custom extension of <Graph.Label.Native>.

     Extends:

     All <Graph.Label.Native> methods

     See also:

     <Graph.Label.Native>

     */
  RGraph.Label.Native = new Class( {
    Implements: Graph.Label.Native,

    initialize: function(viz) {
      this.viz = viz;
      this.label = viz.config.Label;
      this.config = viz.config;
    },

    renderLabel: function(canvas, node, controller) {
      var span = node.getData('span');
      if(span < Math.PI /2 && Math.tan(span) *
          this.config.levelDistance * node._depth < 10) {
        return;
      }
      var ctx = canvas.getCtx();
      var measure = ctx.measureText(node.name);
      if (node.id == this.viz.root) {
        var x = -measure.width / 2, y = 0, thetap = 0;
        var ld = 0;
      } else {
        var indent = 5;
        var ld = controller.levelDistance - indent;
        var clone = node.pos.clone();
        clone.rho += indent + (node.getData('dim') || 0);
        var p = clone.getp(true);
        var ct = clone.getc(true);
        var x = ct.x, y = ct.y;
        // get angle in degrees
        var pi = Math.PI;
        var cond = (p.theta > pi / 2 && p.theta < 3 * pi / 2);
        var thetap = cond ? p.theta + pi : p.theta;
        if (cond) {
          x -= Math.abs(Math.cos(p.theta) * measure.width);
          y += Math.sin(p.theta) * measure.width;
        } else if (node.id == this.viz.root) {
          x -= measure.width / 2;
        }
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(thetap);
      ctx.fillText(node.name, 0, 0);
      ctx.restore();
    }
  });

    /*
     RGraph.Label.SVG

     Custom extension of <Graph.Label.SVG>.

     Extends:

     All <Graph.Label.SVG> methods

     See also:

     <Graph.Label.SVG>

     */
    RGraph.Label.SVG = new Class( {
        Implements: Graph.Label.SVG,

        initialize: function(viz){
            this.viz = viz;
        },

        /*
         placeLabel

         Overrides abstract method placeLabel in <Graph.Plot>.

         Parameters:

         tag - A DOM label element.
         node - A <Graph.Node>.
         controller - A configuration/controller object passed to the visualization.

         */
        placeLabel: function(tag, node, controller){
            var pos = node.pos.getc(true),
                canvas = this.viz.canvas,
                ox = canvas.translateOffsetX,
                oy = canvas.translateOffsetY,
                sx = canvas.scaleOffsetX,
                sy = canvas.scaleOffsetY,
                radius = canvas.getSize();
            var labelPos = {
                x: Math.round(pos.x * sx + ox + radius.width / 2),
                y: Math.round(pos.y * sy + oy + radius.height / 2)
            };
            tag.setAttribute('x', labelPos.x);
            tag.setAttribute('y', labelPos.y);

            controller.onPlaceLabel(tag, node);
        }
    });

    /*
     RGraph.Label.HTML

     Custom extension of <Graph.Label.HTML>.

     Extends:

     All <Graph.Label.HTML> methods.

     See also:

     <Graph.Label.HTML>

     */
    RGraph.Label.HTML = new Class( {
        Implements: Graph.Label.HTML,

        initialize: function(viz){
            this.viz = viz;
        },
        /*
         placeLabel

         Overrides abstract method placeLabel in <Graph.Plot>.

         Parameters:

         tag - A DOM label element.
         node - A <Graph.Node>.
         controller - A configuration/controller object passed to the visualization.

         */
        placeLabel: function(tag, node, controller){
            var pos = node.pos.getc(true),
                sc = radialScale(node.pos, this.viz.config),
                canvas = this.viz.canvas,
                ox = canvas.translateOffsetX,
                oy = canvas.translateOffsetY,
                sx = canvas.scaleOffsetX,
                sy = canvas.scaleOffsetY,
                radius = canvas.getSize();
            var labelPos = {
                x: Math.round(pos.x * sx + ox + radius.width / 2),
                y: Math.round(pos.y * sy + oy + radius.height / 2)
            };

            var style = tag.style;
            style.left = labelPos.x + 'px';
            style.top = labelPos.y + 'px';
            style.display = this.fitsInCanvas(labelPos, canvas)? '' : 'none';

            controller.onPlaceLabel(tag, node);
        }
    });

    /*
     Class: RGraph.Plot.NodeTypes

     This class contains a list of <Graph.Node> built-in types.
     Node types implemented are 'none', 'circle', 'triangle', 'rectangle', 'star', 'ellipse' and 'square'.

     You can add your custom node types, customizing your visualization to the extreme.

     Example:

     (start code js)
     RGraph.Plot.NodeTypes.implement({
     'mySpecialType': {
     'render': function(node, canvas) {
     //print your custom node to canvas
     },
     //optional
     'contains': function(node, pos) {
     //return true if pos is inside the node or false otherwise
     }
     }
     });
     (end code)

     */
    RGraph.Plot.NodeTypes = new Class({
        'none': {
            'render': $.empty,
            'contains': $.lambda(false)
        },
        'circle': {
            'render': function(node, canvas){
                var pos = node.pos.getc(true),
                    dim = node.getData('dim'),
                    sc = node.getData('scale');
                this.nodeHelper.circle.render('fill', pos, sc*dim, canvas);
            },
            'contains': function(node, pos){
                var pos = node.pos.getc(true),
                    dim = node.getData('dim'),
                    sc = node.getData('scale');
                return this.nodeHelper.circle.contains(npos, pos, sc*dim);
            }
        },
        'ellipse': {
            'render': function(node, canvas){
                var pos = node.pos.getc(true),
                    width = node.getData('width'),
                    height = node.getData('height'),
                    sc = node.getData('scale');
                this.nodeHelper.ellipse.render('fill', pos, sc*width, sc*height, canvas);
            },
            'contains': function(node, pos){
                var npos = node.pos.getc(true),
                    width = node.getData('width'),
                    height = node.getData('height'),
                    sc = node.getData('scale');
                return this.nodeHelper.ellipse.contains(npos, pos, sc*width, sc*height);
            }
        },
        'square': {
            'render': function(node, canvas){
                var pos = node.pos.getc(true),
                    dim = node.getData('dim'),
                    sc = node.getData('scale');
                this.nodeHelper.square.render('fill', pos, sc*dim, canvas);
            },
            'contains': function(node, pos){
                var npos = node.pos.getc(true),
                    dim = node.getData('dim'),
                    sc = node.getData('scale');
                return this.nodeHelper.square.contains(npos, pos, sc*dim);
            }
        },
        'rectangle': {
            'render': function(node, canvas){
                var pos = node.pos.getc(true),
                    width = node.getData('width'),
                    height = node.getData('height'),
                    sc = node.getData('scale');
                this.nodeHelper.rectangle.render('fill', pos, sc*width, sc*height, canvas);
            },
            'contains': function(node, pos){
                var npos = node.pos.getc(true),
                    width = node.getData('width'),
                    height = node.getData('height'),
                    sc = node.getData('scale');
                return this.nodeHelper.rectangle.contains(npos, pos, sc*width, sc*height);
            }
        },
        'triangle': {
            'render': function(node, canvas){
                var pos = node.pos.getc(true),
                    dim = node.getData('dim'),
                    sc = node.getData('scale');
                this.nodeHelper.triangle.render('fill', pos, sc*dim, canvas);
            },
            'contains': function(node, pos) {
                var npos = node.pos.getc(true),
                    dim = node.getData('dim'),
                    sc = node.getData('scale');
                return this.nodeHelper.triangle.contains(npos, pos, sc*dim);
            }
        },
        'star': {
            'render': function(node, canvas){
                var pos = node.pos.getc(true),
                    dim = node.getData('dim'),
                    sc = node.getData('scale');
                this.nodeHelper.star.render('fill', pos, sc*dim, canvas);
            },
            'contains': function(node, pos) {
                var npos = node.pos.getc(true),
                    dim = node.getData('dim'),
                    sc = node.getData('scale');
                return this.nodeHelper.star.contains(npos, pos, sc*dim);
            }
        }
    });

    /*
     Class: RGraph.Plot.EdgeTypes

     This class contains a list of <Graph.Adjacence> built-in types.
     Edge types implemented are 'none', 'line' and 'arrow'.

     You can add your custom edge types, customizing your visualization to the extreme.

     Example:

     (start code js)
     RGraph.Plot.EdgeTypes.implement({
     'mySpecialType': {
     'render': function(adj, canvas) {
     //print your custom edge to canvas
     },
     //optional
     'contains': function(adj, pos) {
     //return true if pos is inside the arc or false otherwise
     }
     }
     });
     (end code)

     */
    RGraph.Plot.EdgeTypes = new Class({
        'none': $.empty,
        'line': {
            'render': function(adj, canvas) {
                var from = adj.nodeFrom.pos.getc(true),
                    to = adj.nodeTo.pos.getc(true);
                this.edgeHelper.line.render(from, to, canvas);
            },
            'contains': function(adj, pos) {
                var from = adj.nodeFrom.pos.getc(true),
                    to = adj.nodeTo.pos.getc(true);
                return this.edgeHelper.line.contains(from, to, pos, this.edge.epsilon);
            }
        },
        'arrow': {
            'render': function(adj, canvas) {
                var from = adj.nodeFrom.pos.getc(true),
                    to = adj.nodeTo.pos.getc(true),
                    dim = adj.getData('dim'),
                    direction = adj.data.$direction,
                    inv = (direction && direction.length>1 && direction[0] != adj.nodeFrom.id),
                    arrowPosition = this.edge.arrowPosition || 'end';
                this.edgeHelper.arrow.render(from, to, dim, inv, canvas, arrowPosition);
            },
            'contains': function(adj, pos) {
                var from = adj.nodeFrom.pos.getc(true),
                    to = adj.nodeTo.pos.getc(true);
                return this.edgeHelper.arrow.contains(from, to, pos, this.edge.epsilon);
            }
        }
    });

})($jit.RGraph);
