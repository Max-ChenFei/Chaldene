//packer version

(function(global) {
	var globalsRegistered = false;
    function ensureGlobalHandlers() {
        if (globalsRegistered) { return; }
        registerGlobalHandlers();
        globalsRegistered = true;
    }

    function registerGlobalHandlers() {
        // When the window resizes, we need to refresh active editors.
        var resizeTimer;
        window.addEventListener('resize', function() {
          if (resizeTimer == null) { resizeTimer = setTimeout(function () {
            resizeTimer = null;
            forEachLiteGraphCanvas(onResize);
          }, 100);
        };
        }, true);
    }

    function forEachLiteGraphCanvas(f) {
        if (!document.getElementsByClassName) { return; }
        var byClass = document.getElementsByTagName("canvas"), all_graph_canvas = [];
        for (var i = 0; i < byClass.length; i++) {
          var graph_canvas = byClass[i].data;
          if (graph_canvas) { all_graph_canvas.push(graph_canvas); }
        }
        if (all_graph_canvas.length) {
          for (var i = 0; i < all_graph_canvas.length; i++) { f(all_graph_canvas[i]); }
        }
    }
    // Called when the window resizes
    function onResize(graph_canvas) {
       graph_canvas.resize();
    }
    ensureGlobalHandlers();

    //*********************************************************************************
    // TypeRegistry CLASS
    //*********************************************************************************

    /**
     * TypeRegistry is the class that supports nodes types register, unregister, search.
     *
     * @class TypeRegistry
     */
    function TypeRegistry() {
        this.registered_node_types = {}; // type_name: node_type
    }

    /**
     * Register a node class so it can be listed when the user wants to create a new one
     * @method registerNodeType
     * @param {String} type name of the node and path
     * @param {Class} node_class
     */
    TypeRegistry.prototype.registerNodeType = function(node_class) {
        if (!node_class.prototype) {
            throw "Cannot register a simple object, it must be a class with a prototype";
        }
        Object.setPrototypeOf(node_class.prototype, LGraphNode.prototype);

        if (!node_class.title) {
            node_class.title = node_class.name;
        }
        let type = node_class.type;
        let already_registered = this.registered_node_types[type];
        if(already_registered) console.warn("replacing node type: " + type);
        this.registered_node_types[type] = node_class;

        let pos = type.lastIndexOf(".");
        node_class.category = type.substr(0, pos);
    };

    /**
     * removes a node type
     * @method unregisterNodeType
     * @param {String|Object} type name of the node or the node constructor itself
     */
    TypeRegistry.prototype.unregisterNodeType = function(type) {
        let node_class = type.constructor === String ? this.registered_node_types[type] : type;
        if(!node_class)
            throw ("node type not found: " + type );
        delete this.registered_node_types[node_class.type];
    };

    /**
     * Create a node of a given type with a name. The node is not attached to any graph yet.
     * @method createNode
     * @param {String} type full name of the node class. p.e. "math.sin"
     */
    TypeRegistry.prototype.createNode = function(type_name) {
        let node_class = this.registered_node_types[type_name];
        if(!node_class) return undefined;
        let node = new node_class();
        if (node.onNodeCreated ) {
            node.onNodeCreated();
        }
        return node;
    };

    /**
      * Returns a registered node type with a given name
      * @method getNodeType
      * @param {String} name_filter full name contain the name_filter string
      * @return {Class} the node class
      */
    TypeRegistry.prototype.getNodeTypesByNameFilter = function (name_filter) {
        name_filter = name_filter? name_filter: "";
        let node_classes = [];
        for (const node_class of Object.values(this.registered_node_types)) {
           if(node_class.name.includes(name_filter))
               node_classes.push(node_class);
        }
        return node_classes;
     };

    /**
     * Removes all previously registered node's types
     */
    TypeRegistry.prototype.clearRegisteredTypes = function() {
        this.registered_node_types = {};
        this.node_types_in_categories = {};
    };


    // *************************************************************
    //   LiteGraph CLASS                                     *******
    // *************************************************************

    /**
     * The Global Scope. It contains all the registered node classes.
     *
     * @class LiteGraph
     * @constructor
     */

    var LiteGraph = (global.LiteGraph = {

        NODE_TITLE_HEIGHT: 30,
        NODE_TITLE_TEXT_Y: 20,
        NODE_SLOT_HEIGHT: 20,
        NODE_WIDGET_HEIGHT: 20,
        NODE_WIDTH: 140,
        NODE_MIN_WIDTH: 50,
        NODE_COLLAPSED_RADIUS: 10,
        NODE_COLLAPSED_WIDTH: 80,
        NODE_TITLE_COLOR: "#999",
        NODE_SELECTED_TITLE_COLOR: "#FFF",
        NODE_TEXT_SIZE: 14,
        NODE_TEXT_COLOR: "#AAA",
        NODE_SUBTEXT_SIZE: 12,
        NODE_DEFAULT_COLOR: "#333",
        NODE_DEFAULT_BGCOLOR: "#353535",
        NODE_DEFAULT_BOXCOLOR: "#666",
        NODE_DEFAULT_SHAPE: "box",
        NODE_BOX_OUTLINE_COLOR: "#FFBF00",
        DEFAULT_SHADOW_COLOR: "rgba(0,0,0,0.5)",
        DEFAULT_GROUP_FONT: 24,

        WIDGET_BGCOLOR: "#222",
        WIDGET_OUTLINE_COLOR: "#666",
        WIDGET_TEXT_COLOR: "#DDD",
        WIDGET_SECONDARY_TEXT_COLOR: "#999",

        LINK_COLOR: "#9A9",
        EVENT_LINK_COLOR: "#AFA",
        CONNECTING_LINK_COLOR: "#AFA",

        DEFAULT_POSITION: [100, 100], //default node position
        VALID_SHAPES: ["default", "box", "round", "card"],

        //shapes are used for nodes but also for slots
        BOX_SHAPE: 1,
        ROUND_SHAPE: 2,
        CIRCLE_SHAPE: 3,
        CARD_SHAPE: 4,
        ARROW_SHAPE: 5,
        GRID_SHAPE: 6, // intended for slot arrays

        UP: 1,
        DOWN: 2,
        LEFT: 3,
        RIGHT: 4,
        CENTER: 5,

        LINK_RENDER_MODES: ["Straight", "Linear", "Spline"], // helper
        STRAIGHT_LINK: 0,
        LINEAR_LINK: 1,
        SPLINE_LINK: 2,

        NO_TITLE: 1,
        TRANSPARENT_TITLE: 2,
        AUTOHIDE_TITLE: 3,
        VERTICAL_LAYOUT: "vertical", // arrange nodes vertically

        proxy: null, //used to redirect calls

        debug: false,
        catch_exceptions: true,
        throw_errors: true,

		Globals: {}, //used to store vars between graphs

        searchbox_extras: {}, //used to add extra features to the search box

		node_box_coloured_when_on: false, // [true!] this make the nodes box (top left circle) coloured when triggered (execute/action), visual feedback
        node_box_coloured_by_mode: false, // [true!] nodebox based on node mode, visual feedback

        dialog_close_on_mouse_leave: true, // [false on mobile] better true if not touch device, TODO add an helper/listener to close if false
        dialog_close_on_mouse_leave_delay: 500,

        shift_click_do_break_link_from: false, // [false!] prefer false if results too easy to break links - implement with ALT or TODO custom keys
        click_do_break_link_to: false, // [false!]prefer false, way too easy to break links

        search_hide_on_mouse_leave: true, // [false on mobile] better true if not touch device, TODO add an helper/listener to close if false
        search_filter_enabled: true, // [true!] enable filtering slots type in the search widget, !requires auto_load_slot_types or manual set registered_slot_[in/out]_types and slot_types_[in/out]
        search_show_all_on_open: true, // [true!] opens the results list when opening the search widget

        auto_load_slot_types: false, // [if want false, use true, run, get vars values to be statically set, than disable] nodes types and nodeclass association with node types need to be calculated, if dont want this, calculate once and set registered_slot_[in/out]_types and slot_types_[in/out]

		// set these values if not using auto_load_slot_types

		alt_drag_do_clone_nodes: false, // [true!] very handy, ALT click to clone and drag the new node

		do_add_triggers_slots: false, // [true!] will create and connect event slots when using action/events connections, !WILL CHANGE node mode when using onTrigger (enable mode colors), onExecuted does not need this

		release_link_on_empty_shows_menu: true, //[true!] dragging a link to empty space will open a menu, add from list, search or defaults

        pointerevents_method: "mouse", // "mouse"|"pointer" use mouse for retrocompatibility issues? (none found @ now)
        // TODO implement pointercancel, gotpointercapture, lostpointercapture, (pointerover, pointerout if necessary)

        type_registry: new TypeRegistry(),
        /**
         * Register a node class so it can be listed when the user wants to create a new one
         * @method registerNodeType
         * @param {String} type name of the node and path
         * @param {Class} base_class class containing the structure of a node
         */

        registerNodeType: function(type, base_class) {
            return this.type_registry.registerNodeType(type, base_class);
        },

        /**
         * removes a node type from the system
         * @method unregisterNodeType
         * @param {String|Object} type name of the node or the node constructor itself
         */
        unregisterNodeType: function(type) {
            return this.type_registry.unregisterNodeType(type);
		},

        /**
         * Removes all previously registered node's types
         */
        clearRegisteredTypes: function() {
            return this.type_registry.clearRegisteredTypes();
        },

        /**
         * Create a node of a given type with a name. The node is not attached to any graph yet.
         * @method createNode
         * @param {String} type full name of the node class. p.e. "math/sin"
         * @param {String} name a name to distinguish from other nodes
         * @param {Object} options to set options
         */

        createNode: function(type, options) {
            return this.type_registry.createNode(type, options);
        },

        /**
         * Returns a registered node type with a given name
         * @method getNodeType
         * @param {String} type full name of the node class. p.e. "math/sin"
         * @return {Class} the node class
         */
        getNodeType: function(type) {
            return this.type_registry.getNodeType[type];
        },

        /**
         * Returns if the types of two slots are compatible (taking into account wildcards, etc)
         * @method isDataTypeMatch
         * @param {String} type_a
         * @param {String} type_b
         * @return {Boolean} true if they can be connected
         */
        isDataTypeMatch: function(type_a, type_b) {
            return type_a == type_b || [type_a, type_b].includes("*");
        },

        /**
         * Wrapper to load files (from url using fetch or from file using FileReader)
         * @method fetchFile
         * @param {String|File|Blob} url the url of the file (or the file itself)
         * @param {String} type an string to know how to fetch it: "text","arraybuffer","json","blob"
         * @param {Function} on_complete callback(data)
         * @param {Function} on_error in case of an error
         * @return {FileReader|Promise} returns the object used to
         */
		fetchFile: function( url, type, on_complete, on_error ) {
			var that = this;
			if(!url)
				return null;

			type = type || "text";
			if( url.constructor === String )
			{
				if (url.substr(0, 4) == "http" && LiteGraph.proxy) {
					url = LiteGraph.proxy + url.substr(url.indexOf(":") + 3);
				}
				return fetch(url)
				.then(function(response) {
					if(!response.ok)
						 throw new Error("File not found"); //it will be catch below
					if(type == "arraybuffer")
						return response.arrayBuffer();
					else if(type == "text" || type == "string")
						return response.text();
					else if(type == "json")
						return response.json();
					else if(type == "blob")
						return response.blob();
				})
				.then(function(data) {
					if(on_complete)
						on_complete(data);
				})
				.catch(function(error) {
					console.error("error fetching file:",url);
					if(on_error)
						on_error(error);
				});
			}
			else if( url.constructor === File || url.constructor === Blob)
			{
				var reader = new FileReader();
				reader.onload = function(e)
				{
					var v = e.target.result;
					if( type == "json" )
						v = JSON.parse(v);
					if(on_complete)
						on_complete(v);
				}
				if(type == "arraybuffer")
					return reader.readAsArrayBuffer(url);
				else if(type == "text" || type == "json")
					return reader.readAsText(url);
				else if(type == "blob")
					return reader.readAsBinaryString(url);
			}
			return null;
		}
    });

    //timer that works everywhere
    if (typeof performance != "undefined") {
        LiteGraph.getTime = performance.now.bind(performance);
    } else if (typeof Date != "undefined" && Date.now) {
        LiteGraph.getTime = Date.now.bind(Date);
    } else if (typeof process != "undefined") {
        LiteGraph.getTime = function() {
            var t = process.hrtime();
            return t[0] * 0.001 + t[1] * 1e-6;
        };
    } else {
        LiteGraph.getTime = function getTime() {
            return new Date().getTime();
        };
    }

    let makeSureNameUniqueIn = function (name, obj) {
        if (!name in obj) {
            throw "Name is already in use";
        }
    };

    function Variable(name, type, value) {
        this.name = name;
        this.type = type;
        this.value = value;
    }

    Variable.prototype.getValue = function() {
        return this.value;
    };

    Variable.prototype._update = function(name, new_value) {
        if (this[name] != new_value)
            this[name] = new_value;
    };

    Variable.prototype.updateName = function(new_name) {
       this._update('name', new_name);
    };

    Variable.prototype.updateType = function(new_type) {
        this._update('type', new_type);
    };

    Variable.prototype.updateValue = function(new_value) {
        this._update('value', new_value);
    };

    //*********************************************************************************
    // LGraph CLASS
    //*********************************************************************************

    /**
     * LGraph is the class that contain a full graph. We instantiate one and add nodes to it.
	 * supported callbacks:
		+ onNodeAdded: when a new node is added to the graph
		+ onNodeRemoved: when a node inside this graph is removed
		+ onNodeConnectionChange: some connection has changed in the graph (connected or disconnected)
     *
     * @class LGraph
     * @constructor
     * @param {Object} o data from previous serialization [optional]
     */

    function LGraph(o) {
        this.init();
    }

    global.LGraph = LiteGraph.LGraph = LGraph;

    LGraph.prototype.init = function() {
        this.nodes = {}; // for better collision detection
        this.connectors = {};
        this.out_connector_ids = {}; // {out_node: {out_slot: connector_ids,... }}
        this.in_connectors_ids = {}; // {in_node: {in_slot: connector_ids,... }}
        this.local_vars = {};
        this.subgraphs = {};
        this.inputs = {};
        this.outputs = {};
        this.next_unique_id = 0;
    };

    LGraph.prototype.getUniqueId = function() {
        return this.next_unique_id++;
    };

    /**
     * Clear the graph
     * @method clear
     */
    LGraph.prototype.clear = function() {
        for (const node of Object.values(this.nodes)) {
            if (node.onRemoved) {
                node.onRemoved();
            }
        }
        this.init();
    };

    /**
     * Positions every node in a more readable manner
     * @method arrange
     */
    LGraph.prototype.arrange = function (margin, layout) {
        margin = margin || 100;

        var nodes = this.computeExecutionOrder(false, true);
        var columns = [];
        for (var i = 0; i < nodes.length; ++i) {
            var node = nodes[i];
            var col = node._level || 1;
            if (!columns[col]) {
                columns[col] = [];
            }
            columns[col].push(node);
        }

        var x = margin;

        for (var i = 0; i < columns.length; ++i) {
            var column = columns[i];
            if (!column) {
                continue;
            }
            var max_size = 100;
            var y = margin + LiteGraph.NODE_TITLE_HEIGHT;
            for (var j = 0; j < column.length; ++j) {
                var node = column[j];
                node.pos[0] = (layout == LiteGraph.VERTICAL_LAYOUT) ? y : x;
                node.pos[1] = (layout == LiteGraph.VERTICAL_LAYOUT) ? x : y;
                max_size_index = (layout == LiteGraph.VERTICAL_LAYOUT) ? 1 : 0;
                if (node.size[max_size_index] > max_size) {
                    max_size = node.size[max_size_index];
                }
                node_size_index = (layout == LiteGraph.VERTICAL_LAYOUT) ? 0 : 1;
                y += node.size[node_size_index] + margin + LiteGraph.NODE_TITLE_HEIGHT;
            }
            x += max_size + margin;
        }

        this.setDirtyCanvas(true, true);
    };

    /**
     * Adds a new node instance to this graph
     * @method add
     * @param {LGraphNode} node the instance of the node
     */
    LGraph.prototype.add = function(node) {
        if (!node) return;

        node.id =  this.getUniqueId();
        this.nodes[node.id] = node;

        if (node.onAdded) {
            node.onAdded();
        }

        if (this.onNodeAdded) {
            this.onNodeAdded(node);
        }
    };

    /**
     * remove a connector
     * @method removeConnector
     * @param {Number} connector_id
     */
    LGraph.prototype.removeConnector = function(connector_id) {
        const connector = this.connectors[connector_id];
        if(!connector) return;

        let out_node = this.nodes[connector.out_node_id];
        if (out_node) out_node.breakConnectionOfOutput(connector.out_slot_name);
        let in_node = this.nodes[connector.in_node_id];
        if (in_node) in_node.breakConnectionOfInput(connector.in_slot_name);

        delete this.in_connectors[connector.in_node_id][connector.in_slot_name];
        delete this.out_connectors[connector.out_node_id][connector.out_slot_name];
        delete this.connectors[connector_id];
    };

    LGraph.prototype.removeConnectors = function(connector_ids) {
        if (connector_ids.constructor === Array)
            for (const id of connector_ids) {
                this.removeConnector(id);
            }
    };

    LGraph.prototype.clearInConnectorsOfNode = function(node_id) {
        const ids = Object.values(this.in_connectors[node_id]);
        this.removeConnectors(ids);
    };

    LGraph.prototype.clearOutConnectorsOfNode = function(node_id) {
        const ids = Object.values(this.out_connectors[node_id]);
        this.removeConnectors(ids);
    };

    LGraph.prototype.clearConnectorsOfNode = function(node_id) {
        this.clearInConnectorsOfNode(node_id);
        this.clearOutConnectorsOfNode(node_id);
    };

    /**
     * Removes a node from the graph
     * @method remove
     * @param {String} node_id
     */
    LGraph.prototype.remove = function(node_id) {
        const node = this.nodes[node_id]
        if (!node) return;

        if (this.onNodeRemoved) {
            this.onNodeRemoved(node_id);
        }
        this.clearConnectorsOfNode(node_id);

        if (node.onRemoved) {
            node.onRemoved();
        }
        delete this.nodes[node.id];
    };

    /**
     * Returns a node by its id.
     * @method getNodeById
     * @param {Number} id
     */
    LGraph.prototype.getNodeById = function(id) {
        if (!id) return null;
        return this.nodes[id];
    };

    LGraph.prototype.addSubGraph = function(name, subgraph) {
        makeSureNameUniqueIn(name, this.subgraphs);
        this.subgraphs[name] = subgraph;
    };

    LGraph.prototype.removeSubGraph = function(name) {
        delete this.subgraphs[name];
    };

    LGraph.prototype.getSubGraph = function(name) {
        return this.subgraphs[name];
    };

    /**
     * @method add variable to objects
     * @param {String} name
     * @param {String} type
     * @param {*} value [optional]
     */
    LGraph.prototype.addVarTo = function(name, type, value, obj, callback) {
        makeSureNameUniqueIn(name, Object.keys(obj));
        let v = new Variable(name, type, value);
        obj[name] = v;

        if (callback) {
            callback(v);
        }
    };

    LGraph.prototype.addInput = function(name, type, value) {
        this.addVarTo(name, type, value, this.inputs, this.onInputAdded);
    };

    LGraph.prototype.addOutput = function(name, type, value) {
        this.addVarTo(name, type, value, this.outputs, this.onOutputAdded);
    };

    LGraph.prototype.addLocalVar = function(name, type, value) {
        this.addVarTo(name, type, value, this.local_vars);
    };

    /**
     * @method getVarValue
     * @param {String} name
     * @return {*} the value
     */
    LGraph.prototype.getVarValueFrom = function(name, obj) {
        let v = obj[name];
        if (!v) return null;
        return v.getValue();
    };

    LGraph.prototype.getInputValue = function(name) {
        this.getVarValueFrom(name, this.inputs)
    };

    LGraph.prototype.getOutputValue = function(name) {
        this.getVarValueFrom(name, this.outputs)
    };

    LGraph.prototype.getLocalVarValue = function(name) {
        this.getVarValueFrom(name, this.local_vars)
    };

    /**
     * Assign a data to the global graph variable
     * @method setGlobalInputData
     * @param {String} name
     * @param {*} data
     */
    LGraph.prototype.setVarValueOf = function(name, new_value, obj) {
        let v = obj[name];
        if (!v) return;
        v.updateValue(new_value);
    };

    LGraph.prototype.setInputVarValue = function(name, new_value) {
       this.setVarValueOf(name, new_value, this.inputs)
    };

    LGraph.prototype.setOutputVarValue = function(name, new_value) {
       this.setVarValueOf(name, new_value, this.outputs)
    };

    LGraph.prototype.setLocalVarValue = function(name, new_value) {
       this.setVarValueOf(name, new_value, this.local_vars)
    };

    /**
     * @method renameInput
     * @param {String} name
     * @param {String} new_name
     */
    LGraph.prototype.renameVarOf = function(name, new_name, obj, callback) {
        if (name == new_name) return;

        let v = obj[name];
        if (!v) return;

        makeSureNameUniqueIn(new_name, Object.keys(this.inputs));
        v.updateName(new_name);

        obj[new_name] = obj[name];
        delete obj[new_name];

        if (callback) {
            callback(name, new_name);
        }
    };

    LGraph.prototype.renameInputVar = function(name, new_name) {
        this.renameVarOf(name, new_name, this.inputs);
    };

    LGraph.prototype.renameOutputVar = function(name, new_name) {
        this.renameVarOf(name, new_name, this.outputs);
    };

    LGraph.prototype.renameLocalVarVar = function(name, new_name) {
        this.renameVarOf(name, new_name, this.local_vars);
    };

    /**
     * Changes the type of a variable
     * @method changeInputType
     * @param {String} name
     * @param {String} type
     */
    LGraph.prototype.changeVarTypeOf = function(name, new_type, obj) {
        let v = obj[name];
        if (!v) return;
        v.updateType(new_type);
    };

    LGraph.prototype.changeInputVarType = function(name, new_type) {
      this.changeVarTypeOf(name, new_type, this.inputs)
    };

    LGraph.prototype.changeOutputVarType = function(name, new_type) {
      this.changeVarTypeOf(name, new_type, this.outputs)
    };

    LGraph.prototype.changeLocalVarType = function(name, new_type) {
      this.changeVarTypeOf(name, new_type, this.local_vars)
    };

    /**
     * Removes a variable
     * @method removeInput
     * @param {String} name
     * @param {String} type
     */
    LGraph.prototype.removeVarOf = function(name, obj) {
        let v = obj[name];
        if (!v) return;
        delete obj[name];
    };

    LGraph.prototype.removeInputVar = function(name) {
       this.removeVarOf(name, this.inputs);
    };

    LGraph.prototype.removeOutputVar = function(name) {
       this.removeVarOf(name, this.outputs);
    };

    LGraph.prototype.removeLocalVar = function(name) {
       this.removeVarOf(name, this.local_vars);
    };


    // *************************************************************
    //   Connector CLASS                                     *******
    // *************************************************************
    /**
     * Connector links the the output node and input node
     * @method node slot class
     * @param {Number} id the unique id of this connector
     * @param {Number} out_node_id
     * @param {String} out_slot_name
     * @param {Number} in_node_id
     * @param {String} in_slot_name
     */
    function Connector(id, out_node_id, out_slot_name, in_node_id, in_slot_name) {
        this.id = id;
        this.out_node_id = out_node_id;
        this.out_slot_name = out_slot_name;
        this.in_node_id = in_node_id;
        this.in_slot_name = in_slot_name;

        this._pos = new Float32Array(2); //center
    }

    Connector.prototype.configure = function(o) {
        if (o.constructor === Array) {
            this.id = o[0];
            this.out_node_id = o[1];
            this.out_slot_name = o[2];
            this.in_node_id = o[3];
            this.in_slot_name = o[4];
        } else {
            this.id = o.id;
            this.out_node_id = o.out_node_id;
            this.out_slot_name = o.out_slot_name;
            this.in_node_id = o.in_node_id;
            this.in_slot_name = o.in_slot_name;
        }
    };

    Connector.prototype.serialize = function() {
        return [
            this.id,
            this.out_node_id,
            this.out_slot_name,
            this.in_node_id,
            this.in_slot_name
        ];
    };

    Connector.prototype.configRendering = function(config) {
        for (const [name, value] of config) {
            if (name instanceof String)
                this.prototype[name] = value;
            this.prototype.name = value;
        }
    };

    LiteGraph.Connector = Connector;

    const SlotType = {
        Exec: "Exec",
        number: "number",
        string: "string",
        boolean: "boolean"
    }
    
    // *************************************************************
    //   Slot CLASS                                          *******
    // *************************************************************
    const SlotPos = Object.freeze({
        exec_in: 0,
        exec_out: 1,
        data_in: 2,
        data_out: 3
    });

     /**
     * areMultipleValuesInArray
     * @method areMultipleValuesInArray
     * @param {Array} values
     * @param {Array} Array
     */
    function areMultipleValuesInArray(values, Array){
        return values.every(s => {return array.includes(s)});
    }

    /**
     * Node slot
     * @method node slot class
     * @param {SlotPos} t_a
     * @param {SlotPos} t_b
     * @return {Boolean} do these two slot type match
     */
    function isSlotPosMatch(t_a, t_b){
        if (t_a === t_b)
            return false;

        const slots = [t_a, t_b];
        const exec_slots = [SlotPos.exec_in, SlotPos.exec_out];
        if (areMultipleValuesInArray(slots, exec_slots))
            return true;

        const data_slots = [SlotPos.data_in, SlotPos.data_out];
        if (areMultipleValuesInArray(slots, data_slots))
            return true;

        return false;
    };

    const SlotConnectionMethod = Object.freeze({
        add: 0,
        replace: 1,
        null: 2
    });


     /**
     * SlotConnection
     * @method SlotConnection
     * @param {SlotConnectionMethod} method
     * @param {String} desc
     */
    function SlotConnection(method, desc) {
        this.method = method;
        this.desc = desc;
    };

    function Point(x, y){
        if (Array.isArray(x)){
            if(x.length === 0)
                this.x = this.y = 0;
            else {
                this.x = x[0];
                this.y = x[1 % x.length];
            }
        } else {
            this.x = x || 0;
            this.y = y || 0;
        }
    };

    Point.prototype.add = function(delta_x, delta_y){
        this.x += delta_x? delta_x: 0;
        this.y += delta_y? delta_y: 0;
    };

    function Size(size_x, size_y){
        if (Array.isArray(size_x)){
            if(size_x.length === 0)
                this.size_x = this.size_y = 0;
            else {
                this.size_x = size_x[0];
                this.size_y = size_x[1 % x.length];
            }
        } else {
            this.size_x = size_x || 0;
            this.size_y = size_y || 0;
        }
    }

    /**
     * Node slot
     * @method node slot class
     * @param {String} name unique name of this slot on the node
     * @param {SlotPos} slot_pos
     * @param {String} data_type: if the slot type is data_in or data_out
     * @param {String} default_value: if the slot type is data_in or data_out
     */
     function NodeSlot(name, slot_pos, data_type, default_value) {
         this.name = name;
         this.slot_pos = slot_pos;
         this.data_type = data_type;
         this.default_value = default_value;
         this.connections = 0;
         this.extra_info = {};
         this.state = 'unconnected' || "connected";
         this.hovered = false;
    };

     NodeSlot.prototype.addExtraInfo = function (extra_info) {
         Object.assign(this.extra_info, extra_info);
     };

     NodeSlot.prototype.isConnected = function () {
         return this.connections > 0;
     };

     NodeSlot.prototype.allowConnectTo = function (other_slot) {
         if(!isSlotPosMatch(this.slot_pos, other_slot.slot_pos))
            return new SlotConnection(SlotConnectionMethod.null,
                '{this.data_type} is not compatible with {other_slot.data_type}');

         if(!LiteGraph.isDataTypeMatch(this.data_type, other_slot.data_type))
             return new SlotConnection(SlotConnectionMethod.null,
                 '{this.data_type} is not compatible with {other_slot.data_type}');

         if(this.isConnected() && !this.allowMultipleConnections){
             return new SlotConnection(SlotConnectionMethod.replace,
                 'Replace the existing connections');
         }

         return new SlotConnection(SlotConnectionMethod.add,
             'Add a connection');
     };

     NodeSlot.prototype.addConnection = function () {
         if (this.allowMultipleConnections()){
             this.connections += 1;
         } else {
             this.connections = 1;
         }
     };

     NodeSlot.prototype.breakConnection = function () {
         if (this.connections > 0)
             this.connections = this.connections - 1;
     };

     NodeSlot.prototype.clearConnections = function () {
        this.connections = 0;
    };

    NodeSlot.prototype.allowMultipleConnections = function () {
        if (this.slot_pos === SlotPos.exec_in || this.slot_type === SlotPos.data_out){
            return true;
        }
        return false;
    };

    // *************************************************************
    //   Node CLASS                                          *******
    // *************************************************************

    /*
	title: string
	pos: Point
	size: Size

	node operations callbacks:
		+ onAdded: when added to graph (warning: this is called BEFORE the node is configured when loading)
		+ onRemoved: when removed from graph
		+ onInputAdded
		+ onInputRemoved
		+ onOutputAdded
		+ onOutputRemoved
     	+ onAddConnection
     	+ onBreakConnection
     	+ onClearConnection
		+ onDropItem : DOM item dropped over the node
		+ onDropFile : file dropped over the node
	interaction callbacks:
		+ onSelected
		+ onDeselected
		+ onMouseDown
		+ onMouseUp
		+ onMouseEnter
		+ onMouseLeave
		+ onMove
		+ onDblClick: double clicked in the node
		+ onInputDblClick: input slot double clicked
		+ onOutputDblClick: output slot double clicked
	Serialization callback
		+ onConfigure: called after the node has been configured
		+ onSerialize: to add extra info when serializing (the callback receives the object that should be filled with the data)
    Context menu
		+ getExtraMenuOptions: to add option to context menu
		+ onGetInputs: returns an array of possible inputs
		+ onGetOutputs: returns an array of possible outputs
*/

    /**
     * Base Class for all the node type classes
     * @class LGraphNode
     * @param {String} name a name for the node
     */

    function LGraphNode() {
    }

    global.LGraphNode = LiteGraph.LGraphNode = LGraphNode;

    LGraphNode.prototype.id = undefined;
    LGraphNode.prototype.title = undefined;
    LGraphNode.prototype.type = "*";
    LGraphNode.prototype.desc = "";
    LGraphNode.prototype.inputs = {};
    LGraphNode.prototype.outputs = {};
    LGraphNode.prototype.flags = {};
    LGraphNode.prototype.translate = new Point(0, 0);
    LGraphNode.prototype.scale = new Point(1, 1);
    LGraphNode.prototype.size = new Size(10, 10);
    LGraphNode.prototype.colliable_componnets = {};



    /**
     * get the title string
     * @method getTitle
     */
    LGraphNode.prototype.getTitle = function() {
        return this.title || this.constructor.title;
    };



    /**
     * add a new slot to slots
     * @method addInput
     * @param {string} slot_name
     * @param {SlotPos} slot_pos
     * @param {string} data_type string defining the input type ("vec3","number",...), it its a generic one use *
     * @param {string} default_value
     * @param {Object} extra_info this can be used to have special properties
     * @param {Array} slots
     */
    LGraphNode.prototype.addSlotTo = function(slot_name, slot_pos, data_type, default_value, extra_info, slots, call_back) {
        makeSureNameUniqueIn(slot_name, slots);
        let slot = new NodeSlot(slot_name, slot_pos, data_type, default_value);
        slot.addExtraInfo(extra_info);
        slots[slot_name] = slot;

        if (call_back) {
            call_back(slot);
		}
    };

    /**
     * add a new input slot to use in this node
     * @method addInput
     * @param {string} slot_name
     * @param {string} type string defining the input type ("vec3","number",...), it its a generic one use *
     * @param {string} default_value
     * @param {Object} extra_info this can be used to have special properties of an input (label, color, position, etc)
     */
    LGraphNode.prototype.addInput = function(slot_name, type, default_value, extra_info) {
        const slot_type = type === SlotType.Exec? SlotPos.exec_in : SlotPos.data_in;
        this.addSlotTo(slot_name, slot_type, type, default_value, extra_info, this.inputs, this.onInputAdded);
    };

    /**
     * add a new output slot to use in this node
     * @method addOutput
     * @param {string} slot_name
     * @param {string} type string defining the output type ("vec3","number",...)
     * @param {Object} extra_info this can be used to have special properties of an output (label, special color, position, etc)
     */
     LGraphNode.prototype.addOutput = function(slot_name, type, extra_info) {
         const slot_type = type === SlotType.Exec? SlotPos.exec_out : SlotPos.data_out;
         this.addSlotTo(slot_name, slot_type, type, undefined, extra_info, this.outputs, this.onOutputAdded);
     };

    /**
     * add several new input slots in this node
     * @method addInputs
     * @param {Array} inputs array of triplets like [[name, type, default_value, extra_info],[...]]
     */
     LGraphNode.prototype.addInputs = function(inputs) {
        for (const input of inputs){
            this.addInput(input.name, input.type, default_value, input.extra_info)
        }
     };

     /**
      * add many output slots to use in this node
      * @method addOutputs
      * @param {Array} outputs array of triplets like [[name, type, extra_info],[...]]
      */
     LGraphNode.prototype.addOutputs = function(outputs) {
        for (const output of outputs){
            this.addOutput(output.name, output.type, output.extra_info)
        }
     };

     /**
      * remove one slot from the inputs or outputs, here we don't deal with connections, the graph will handle it.
      * @method addOutputs
      * @param {String} slot_name the name of the slot to be removed
      * @param {Arrary}  slots intput or outputs slots
      */
     LGraphNode.prototype.removeSlotFrom = function(slot_name, slots, call_back) {
        delete slots[slot_name];

        if (call_back) {
            call_back(slot_name);
        }
    };

     /**
      * remove an existing input slot
      * @method removeInput
      * @param {String} slot_name
      */
     LGraphNode.prototype.removeInput = function(slot_name) {
        this.removeSlotFrom(slot_name, this.inputs, this.onInputRemoved);
     };

     /**
      * remove an existing output slot
      * @method removeOutput
      * @param {String} slot_name
      */
     LGraphNode.prototype.removeOutput = function(slot_name) {
         this.removeSlotFrom(slot_name, this.outputs, this.onOutputRemoved);
     };

    /**
     * returns the input slot with a given name (used for dynamic slots), -1 if not found
     * @method findInput
     * @param {string} slot_name the name of the slot
     * @param {boolean} returnObj if the obj itself wanted
     * @return {undefined_or_object} the slot (undefined if not found)
     */
    LGraphNode.prototype.findInput = function(slot_name) {
       return this.inputs[slot_name]
    };

    /**
     * returns the output slot with a given name (used for dynamic slots)
     * @method findOutput
     * @param {string} slot_name the name of the slot
     * @return {undefined_or_object} the slot (undefined if not found)
     */
    LGraphNode.prototype.findOutput = function(slot_name) {
        return this.outputs[slot_name]
    };

    // *********************** node manipulation **************************************
    LGraphNode.prototype.allowConnectTo = function(slot, to_node, to_slot) {
        if (!slot || !to_node || !to_slot) {
            return new SlotConnection(SlotConnectionMethod.null, 'Some input parameters are undefined.');
        }

        if(this == to_node){
            return new SlotConnection(SlotConnectionMethod.null, 'Both are on the same node.');
        }

        return slot.allowConnectTo(to_slot)
    };

    /**
     * Check if the input slot of this node can be connected to the output slot of other node
     * @method connect
     * @param {String} input_slot_name
     * @param {LGraphNode} to_node
     * @param {NodeSlot} to_slot
     */
    LGraphNode.prototype.allowInputConnectTo = function(input_slot_name, to_node, to_slot) {
        this.allowConnectTo(this.inputs[input_slot_name], to_node, to_slot);
    };

    /**
     * Check if the output slot of this node can be connected to the input slot of other node
     * @method connect
     * @param {String} output_slot_name
     * @param {LGraphNode} to_node
     * @param {NodeSlot} to_slot
     */
    LGraphNode.prototype.allowOutputConnectTo = function(output_slot_name, to_node, to_slot) {
        this.allowConnectTo(this.outputs[output_slot_name], to_node, to_slot);
    };
    /**
     * add a connection to the slot. The connector is not recored because the slot can be connected only when the node is added to the graph that will
     * manage how to connect, access to the connectors and nodes.
     * @method connect
     * @param {String} slot_name
     */
    LGraphNode.prototype.addConnectionOf = function(slot) {
        if (!slot) {
            return ;
        }
        slot.addConnection()

        if (this.onAddConnection) {
            this.onAddConnection(slot);
        }
    };

    LGraphNode.prototype.addConnectionOfInput = function(slot_name) {
        this.addConnectionOf(this.inputs[slot_name])
    };

    LGraphNode.prototype.addConnectionOfOutput = function(slot_name) {
        this.addConnectionOf(this.outputs[slot_name])
    };

    LGraphNode.prototype.breakConnectionOf= function(slot) {
        if (!slot) {
            return ;
        }
        slot.breakConnection()

        if (this.onBreakConnection) {
            this.onBreakConnection(slot);
        }
    };

    LGraphNode.prototype.breakConnectionOfOutput = function(slot_name) {
        this.breakConnectionOf(this.outputs[slot_name])
    };

    LGraphNode.prototype.breakConnectionOfInput = function(slot_name) {
        this.breakConnectionOf(this.inputs[slot_name])
    };

    /**
     * disconnect one output to an specific node
     * @method disconnectOutput
     * @param {String} slot_name
     */
    LGraphNode.prototype.clearConnectionsOf = function(slot) {
        if (!slot) {
            return ;
        }
        slot.clearConnections()

        if (this.onClearConnection) {
            this.onClearConnection(slot_name);
        }
    };

    LGraphNode.prototype.clearInConnections= function() {
        for (let slot of this.inputs){
            this.clearConnectionsOf(slot)
        }
    };

    LGraphNode.prototype.clearOutConnections= function() {
        for (let slot of this.outputs){
            this.clearConnectionsOf(slot)
        }
    };

    LGraphNode.prototype.clearNodeConnections= function() {
        this.clearInConnections();
        this.clearOutConnections();
    };

    LGraphNode.prototype.move= function(delta_x, delta_y) {
        this.translate.add(delta_x, delta_y);
        if(this.onMove){
            this.onMove(delta_x, delta_y);
        }
    };

    LGraphNode.prototype.boundingRect = function() {
       return new Rect(0, 0, this.size.size_x, this.size.y);
    };



    function LGraphComment() {
        this.nodes_inside = {};
    }

    LGraphComment.title = "Comment";
    LGraphComment.type = "comment";
    LGraphComment.desc = "Comment";
    global.LGraphComment = LiteGraph.LGraphComment = LGraphComment;

    LGraphComment.prototype.move = function(delta_x, delta_y) {
        for (const node of this.nodes_inside) {
            node.move(delta_x, delta_y)
        }
        if(this.onMove){
            this.onMove(delta_x, delta_y);
        }
    };

    LGraphComment.prototype.addNode = function(node) {
        this.nodes_inside[node.id] = node;
    };

    LGraphComment.prototype.removeNode = function(node_id) {
        delete this.nodes_inside[node_id];
    };

    /**
     * The Rect class defines a rectangle in the plane using number.
     * @class Rect
     * @param {Number} left
     * @param {Number} top
     * @param {Number} width
     * @param {Number} height
     * @constructor
     */
    function Rect(left, top, width, height){
        this.x_1 = left;
        this.y_1 = top;
        this.x_2 = left + width - 1;
        this.y_2 = top + height - 1;
        Object.defineProperties(Rect.prototype, {
            "x": {
                get() { return this.x_1;},
                set(x) { this.x_1 = x}
            },
            "y": {
                get() { return this.y_1;},
                set(y) { this.y_1 = y}
            },
            "width": {
                get() { return this.x_2 - this.x_1 + 1;},
                set(w) { this.x_2 = this.x_1 + w - 1}
            },
            "height": {
                get() { return this.y_2 - this.y_1 + 1;},
                set(h) { this.y_2 = this.y_1 + h - 1}
            }
        });
    };

    Rect.prototype.isValid = function() {
        return this.x_1 <= this.x_2 && this.y_1 <= this.y_2;
    };

    Rect.prototype.isIntersectWith = function(rect) {
        if (!rect) return false;
        return !(this.x_1 > rect.x_2 || rect.x_1 > this.x_2 ||
            this.y_1 > rect.y_2 || rect.y_1 > this.y_2)
    };

    /**
     *
     * @class Scene
     * @constructor
     * @param {HTMLCanvas} canvas the canvas where you want to render
     * @param {LGraph} graph, the content to display
     * @param {Rect} viewport in view coordinate, max size are(canvas.width, canvas.height)
     */
    function Scene(canvas, graph, viewport, drawing_context){
        this.canvas = canvas;
        this.graph = graph;
        this.viewport = viewport;
        this.view = new View(this);
        this.drawing_context = drawing_context || '2d';
        this.renderer = new Renderer(this);
        this.setStartRenderWhenCanvasOnFocus();
        this.setStopRenderWhenCanvasOnBlur();
        this.visiable_items = {};
    };

    Scene.prototype.setStartRenderWhenCanvasOnFocus = function(){
        this.canvas.addEventListener("focus", this.renderer.startRender());
    };

    Scene.prototype.setStopRenderWhenCanvasOnBlur = function(){
        this.canvas.addEventListener("blur", this.renderer.stopRender());
    };

    Scene.prototype.setRenderDrawingContext = function(ctx){
        this.drawing_context = ctx;
        this.renderer.drawing_context = ctx;
    };

    Scene.prototype.sceneRect = function(){
        if(!this.view) return new Rect(0, 0, this.canvas.width, this.canvas.height);
        return this.view.sceneRect();
    };

    //****************************************

    /**
     *
     * @param {Scene} scene
     * @constructor
     */
    function View(scene) {
        this.scene = scene;
        // (pos_scene + translate) * scale = pos_view
        this.translate = new Point(0, 0);
        this.scale = 1;
        this.max_scale = 5;
        this.min_scale = 0.55;
    }

    Object.defineProperties(View.prototype, {
            "canvas": {
                get() {return this.scene.canvas;},
                writable: false
            },
            "viewport": {
                get() { return this.scene.viewport || new Rect(0, 0, this.canvas.width, this.canvas.height);},
                writable: false
            },
            "scale_pivot": {
                get() { return new Point(this.canvas.width/2, this.canvas.height/2);},
                writable: false
            }
        });

    LiteGraph.View = View;

    /**
     * Returns the scene coordinate point from view coordinates.
     * @param {Point} p view coordinate
     * @returns {Point} return the point in scene coordinate
     */
    View.prototype.mapToScene = function(p) {
        return new Point(p.x / this.scale - this.translate.x, p.y / this.scale - this.translate.y);
    };

    View.prototype.mapRectToScene = function(rect) {
        let left_top_p = this.mapToScene(new Point(rect.x_1, rect.y_1));
        let right_bottom_p = this.mapToScene(new Point(rect.x_2, rect.y_2));
        return new Rect(left_top_p.x, left_top_p.y,
            right_bottom_p.x - left_top_p.x + 1, right_bottom_p.y - left_top_p.y  +1);
    };

    /**
     * Returns the mapped scene coordinate point from view coordinates.
     * @param {Point} p scene coordinate
     * @returns {Point} return the point in view coordinate
     */
    View.prototype.mapFromScene = function(p) {
        return new Point((p.x + this.translate.x) * this.scale, (p.y + this.translate.y) * this.scale);
    };

    View.prototype.translate = function(dx_in_scene, dy_in_scene) {
        this.translate.x += dx_in_scene;
        this.translate.y += dy_in_scene;
    };

    View.prototype.translateInView = function(dx, dy) {
        this.translate.x += dx / this.scale;
        this.translate.y += dy / this.scale;
    };

    View.prototype.reset = function() {
        this.scale = 1;
        this.translate.x = this.translate.y = 0;
    };

    View.prototype.scale = function(s, pivot_in_view) {
        s = Math.max(this.min_scale, s);
        s = Math.min(this.max_scale, s);
        if (s == this.scale)  return;
        // keep the pivot point unchanged after scale
        pivot_in_view = pivot_in_view || this.scale_pivot;
        let pivot_before_scale = this.mapToScene(pivot_in_view);
        this.scale = s;
        if (Math.abs(this.scale - 1) < 0.01) this.scale = 1;
        let pivot_after_scale = this.mapToScene(pivot_in_view);
        this.translate(pivot_after_scale.x - pivot_before_scale.x, pivot_after_scale.y - pivot_after_scale.y );
    };

    //the area of the scene visualized by this view
    View.prototype.sceneRect = function() {
        return this.mapRectToScene(this.viewport);
    };

    //*********************************************************************************
    // LGraphCanvas: LGraph renderer CLASS
    //*********************************************************************************

    /**
     * This class is in charge of rendering one graph inside a canvas. And provides all the interaction required.
     * Valid callbacks are: onNodeSelected, onNodeDeselected, onShowNodePanel, onNodeDblClicked
     *
     * @class LGraphCanvas
     * @constructor
     * @param {HTMLCanvas} canvas the canvas where you want to render (it accepts a selector in string format or the canvas element itself)
     * @param {LGraph} graph [optional]
     * @param {Object} options [optional] { skip_rendering, autoresize, viewport }
     */
    function LGraphCanvas(canvas, graph, options) {
        this.options = options = options || {};
        this.background_image = LGraphCanvas.DEFAULT_BACKGROUND_IMAGE;

        if (canvas && canvas.constructor === String) {
            canvas = document.querySelector(canvas);
        }

        this.ds = new View();
        this.zoom_modify_alpha = false; //otherwise it generates ugly patterns when scaling down too much

        this.title_text_font = "" + LiteGraph.NODE_TEXT_SIZE + "px Arial";
        this.inner_text_font =
            "normal " + LiteGraph.NODE_SUBTEXT_SIZE + "px Arial";
        this.node_title_color = LiteGraph.NODE_TITLE_COLOR;
        this.default_link_color = LiteGraph.LINK_COLOR;
        this.default_connection_color = {
            input_off: "#778",
            input_on: "#7F7", //"#BBD"
            output_off: "#778",
            output_on: "#7F7" //"#BBD"
		};
        this.default_connection_color_byType = {
            /*number: "#7F7",
            string: "#77F",
            boolean: "#F77",*/
            __SEQUENCE_TYPE: "#2596be"
        }
        this.default_connection_color_byTypeOff = {
            /*number: "#474",
            string: "#447",
            boolean: "#744",*/
            __SEQUENCE_TYPE: "#05567e"
        };

        this.highquality_render = true;
        this.use_gradients = false; //set to true to render titlebar with gradients
        this.editor_alpha = 1; //used for transition
        this.pause_rendering = false;
        this.clear_background = true;

		this.read_only = false; //if set to true users cannot modify the graph
        this.render_only_selected = true;
        this.live_mode = false;
        this.show_info = false;
        this.allow_dragcanvas = true;
        this.allow_dragnodes = true;
        this.allow_interaction = true; //allow to control widgets, buttons, collapse, etc
        this.allow_searchbox = true;
        this.allow_reconnect_links = true; //allows to change a connection with having to redo it again

        this.drag_mode = false;
        this.dragging_rectangle = null;

        this.filter = null; //allows to filter to only accept some type of nodes in a graph

		this.set_canvas_dirty_on_mouse_event = true; //forces to redraw the canvas if the mouse does anything
        this.always_render_background = true;
        this.render_shadows = true;
        this.render_canvas_border = false;
        this.render_connections_shadows = false; //too much cpu
        this.render_connections_border = true;
        this.render_curved_connections = false;
        this.render_connection_arrows = false;
        this.render_collapsed_slots = true;
        this.render_execution_order = false;
        this.render_title_colored = true;
		this.render_link_tooltip = true;

        this.links_render_mode = LiteGraph.SPLINE_LINK;

        this.mouse = [0, 0]; //mouse in canvas coordinates, where 0,0 is the top-left corner of the blue rectangle
        this.graph_mouse = [0, 0]; //mouse in graph coordinates, where 0,0 is the top-left corner of the blue rectangle
		this.canvas_mouse = this.graph_mouse; //LEGACY: REMOVE THIS, USE GRAPH_MOUSE INSTEAD

        //to personalize the search box
        this.onSearchBox = null;
        this.onSearchBoxSelection = null;

        //callbacks
        this.onMouse = null;
        this.onDrawBackground = null; //to render background objects (behind nodes and connections) in the canvas affected by transform
        this.onDrawForeground = null; //to render foreground objects (above nodes and connections) in the canvas affected by transform
        this.onDrawOverlay = null; //to render foreground objects not affected by transform (for GUIs)
		this.onDrawLinkTooltip = null; //called when rendering a tooltip
		this.onNodeMoved = null; //called after moving a node
		this.onSelectionChange = null; //called if the selection changes
		this.onConnectingChange = null; //called before any link changes
		this.onBeforeChange = null; //called before modifying the graph
		this.onAfterChange = null; //called after modifying the graph

        this.connections_width = 3;
        this.round_radius = 8;

        this.current_node = null;
        this.node_widget = null; //used for widgets
		this.over_link_center = null;
        this.last_mouse_position = [0, 0];
        this.visible_area = this.ds.visible_area;
        this.visible_links = [];

		this.viewport = options.viewport || null; //to constraint render area to a portion of the canvas

        //link canvas and graph
        if (graph) {
            graph.attachCanvas(this);
        }

        this.setCanvas(canvas,options.skip_events);
        this.clear();

        if (!options.skip_render) {
            this.startRendering();
        }
        //Note: imageprocessingcell.js sets a default height of 300
        this.default_height = 300;

        this.autoresize = options.autoresize;

    }

    global.LGraphCanvas = LiteGraph.LGraphCanvas = LGraphCanvas;

	LGraphCanvas.DEFAULT_BACKGROUND_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkAQMAAABKLAcXAAAABlBMVEXMysz8/vzemT50AAAAIklEQVQ4jWNgQAH197///Q8lPtCdN+qWUbeMumXULSPALQDs8NiOERuTbAAAAABJRU5ErkJggg==";

    LGraphCanvas.link_type_colors = {
        "-1": LiteGraph.EVENT_LINK_COLOR,
        number: "#AAA",
        node: "#DCA"
    };
    LGraphCanvas.gradients = {}; //cache of gradients

    /**
     * clears all the data inside
     *
     * @method clear
     */
    LGraphCanvas.prototype.clear = function() {
        this.frame = 0;
        this.last_draw_time = 0;
        this.render_time = 0;
        this.fps = 0;
        this.dragging_rectangle = null;

        this.selected_nodes = {};
        this.selected_comment = null;

        this.visible_nodes = [];
        this.node_dragged = null;
        this.node_over = null;
        this.node_capturing_input = null;
        this.connecting_node = null;
        this.highlighted_links = {};

		this.dragging_canvas = false;

        this.dirty_canvas = true;
        this.dirty_bgcanvas = true;
        this.dirty_area = null;

        this.node_in_panel = null;
        this.node_widget = null;

        this.last_mouse = [0, 0];
        this.last_mouseclick = 0;
	  	this.pointer_is_down = false;
	  	this.pointer_is_double = false;
        this.visible_area.set([0, 0, 0, 0]);

        if (this.onClear) {
            this.onClear();
        }
    };

    /**
     * assigns a graph, you can reassign graphs to the same canvas
     *
     * @method setGraph
     * @param {LGraph} graph
     */
    LGraphCanvas.prototype.setGraph = function(graph, skip_clear) {
        if (this.graph == graph) {
            return;
        }

        if (!skip_clear) {
            this.clear();
        }

        if (!graph && this.graph) {
            this.graph.detachCanvas(this);
            return;
        }

        graph.attachCanvas(this);

		//remove the graph stack in case a function definition was open
		if (this._graph_stack)
			this._graph_stack = null;

        this.setDirty(true, true);
    };

    /**
     * returns the top level graph (in case there are function definitions open on the canvas)
     *
     * @method getTopGraph
     * @return {LGraph} graph
     */
	LGraphCanvas.prototype.getTopGraph = function()
	{
		if(this._graph_stack.length)
			return this._graph_stack[0];
		return this.graph;
	}

    /**
     * opens a graph contained inside a node in the current graph
     *
     * @method openFunctionDefinition
     * @param {LGraph} graph
     */
    LGraphCanvas.prototype.openFunctionDefinition = function(graph) {
        if (!graph) {
            throw "graph cannot be null";
        }

        if (this.graph == graph) {
            throw "graph cannot be the same";
        }

        this.clear();

        if (this.graph) {
            if (!this._graph_stack) {
                this._graph_stack = [];
            }
            this._graph_stack.push(this.graph);
        }

        graph.attachCanvas(this);
		this.checkPanels();
        this.setDirty(true, true);
    };

    /**
     * closes a function definition contained inside a node
     *
     * @method closeFunctionDefinition
     * @param {LGraph} assigns a graph
     */
    LGraphCanvas.prototype.closeFunctionDefinition = function() {
        if (!this._graph_stack || this._graph_stack.length == 0) {
            return;
        }
        var function_definition_node = this.graph._function_definition_node;
        var graph = this._graph_stack.pop();
        this.selected_nodes = {};
        this.highlighted_links = {};
        graph.attachCanvas(this);
        this.setDirty(true, true);
        if (function_definition_node) {
            this.centerOnNode(function_definition_node);
            this.selectNodes([function_definition_node]);
        }
        // when close sub graph back to offset [0, 0] scale 1
        this.ds.offset = [0, 0]
        this.ds.scale = 1
    };

    /**
     * returns the visualy active graph (in case there are more in the stack)
     * @method getCurrentGraph
     * @return {LGraph} the active graph
     */
    LGraphCanvas.prototype.getCurrentGraph = function() {
        return this.graph;
    };

    /**
     * assigns a canvas
     *
     * @method setCanvas
     * @param {Canvas} assigns a canvas (also accepts the ID of the element (not a selector)
     */
    LGraphCanvas.prototype.setCanvas = function(canvas, skip_events) {
        var that = this;

        if (canvas) {
            if (canvas.constructor === String) {
                canvas = document.getElementById(canvas);
                if (!canvas) {
                    throw "Error creating LiteGraph canvas: Canvas not found";
                }
            }
        }

        if (canvas === this.canvas) {
            return;
        }

        if (!canvas && this.canvas) {
            //maybe detach events from old_canvas
            if (!skip_events) {
                this.unbindEvents();
            }
        }

        this.canvas = canvas;
        this.ds.element = canvas;

        if (!canvas) {
            return;
        }

        //this.canvas.tabindex = "1000";
        canvas.className += " lgraphcanvas";
        canvas.data = this;
        canvas.tabindex = "1"; //to allow key events

        //bg canvas: used for non changing stuff
        this.bgcanvas = null;
        if (!this.bgcanvas) {
            this.bgcanvas = document.createElement("canvas");
            this.bgcanvas.width = this.canvas.width;
            this.bgcanvas.height = this.canvas.height;
        }

        if (canvas.getContext == null) {
            if (canvas.localName != "canvas") {
                throw "Element supplied for LGraphCanvas must be a <canvas> element, you passed a " +
                    canvas.localName;
            }
            throw "This browser doesn't support Canvas";
        }

        var ctx = (this.ctx = canvas.getContext("2d"));
        if (ctx == null) {
            if (!canvas.webgl_enabled) {
                console.warn(
                    "This canvas seems to be WebGL, enabling WebGL renderer"
                );
            }
            this.enableWebGL();
        }


        if (!skip_events) {
            this.bindEvents();
        }
    };

    //used in some events to capture them
    LGraphCanvas.prototype._doNothing = function doNothing(e) {
    	//console.log("pointerevents: _doNothing "+e.type);
        e.preventDefault();
        return false;
    };
    LGraphCanvas.prototype._doReturnTrue = function doNothing(e) {
        e.preventDefault();
        return true;
    };

    /**
     * binds mouse, keyboard, touch and drag events to the canvas
     * @method bindEvents
     **/
    LGraphCanvas.prototype.bindEvents = function() {
        if (this._events_binded) {
            console.warn("LGraphCanvas: events already binded");
            return;
        }

        var canvas = this.canvas;

        var ref_window = this.getCanvasWindow();
        var document = ref_window.document; //hack used when moving canvas between windows

        this._mousedown_callback = this.processMouseDown.bind(this);
        this._mousewheel_callback = this.processMouseWheel.bind(this);
        // why mousemove and mouseup were not binded here?
        this._mousemove_callback = this.processMouseMove.bind(this);
        this._mouseup_callback = this.processMouseUp.bind(this);

        //touch events -- TODO IMPLEMENT
        //this._touch_callback = this.touchHandler.bind(this);

		LiteGraph.pointerListenerAdd(canvas,"down", this._mousedown_callback, true); //down do not need to store the binded
        canvas.addEventListener("mousewheel", this._mousewheel_callback, false);

        LiteGraph.pointerListenerAdd(canvas,"up", this._mouseup_callback, true); // CHECK: ??? binded or not
		LiteGraph.pointerListenerAdd(canvas,"move", this._mousemove_callback);

        canvas.addEventListener("contextmenu", this._doNothing);
        canvas.addEventListener(
            "DOMMouseScroll",
            this._mousewheel_callback,
            false
        );

        //touch events -- THIS WAY DOES NOT WORK, finish implementing pointerevents, than clean the touchevents
        /*if( 'touchstart' in document.documentElement )
        {
            canvas.addEventListener("touchstart", this._touch_callback, true);
            canvas.addEventListener("touchmove", this._touch_callback, true);
            canvas.addEventListener("touchend", this._touch_callback, true);
            canvas.addEventListener("touchcancel", this._touch_callback, true);
        }*/

        //Keyboard ******************
        this._key_callback = this.processKey.bind(this);

        canvas.addEventListener("keydown", this._key_callback, true);
        document.addEventListener("keyup", this._key_callback, true); //in document, otherwise it doesn't fire keyup

        //Dropping Stuff over nodes ************************************
        this._ondrop_callback = this.processDrop.bind(this);

        canvas.addEventListener("dragover", this._doNothing, false);
        canvas.addEventListener("dragend", this._doNothing, false);
        canvas.addEventListener("drop", this._ondrop_callback, false);
        canvas.addEventListener("dragenter", this._doReturnTrue, false);

        this._events_binded = true;
    };

    /**
     * unbinds mouse events from the canvas
     * @method unbindEvents
     **/
    LGraphCanvas.prototype.unbindEvents = function() {
        if (!this._events_binded) {
            console.warn("LGraphCanvas: no events binded");
            return;
        }

        var ref_window = this.getCanvasWindow();
        var document = ref_window.document;

		LiteGraph.pointerListenerRemove(this.canvas,"move", this._mousedown_callback);
        LiteGraph.pointerListenerRemove(this.canvas,"up", this._mousedown_callback);
        LiteGraph.pointerListenerRemove(this.canvas,"down", this._mousedown_callback);
        this.canvas.removeEventListener(
            "mousewheel",
            this._mousewheel_callback
        );
        this.canvas.removeEventListener(
            "DOMMouseScroll",
            this._mousewheel_callback
        );
        this.canvas.removeEventListener("keydown", this._key_callback);
        document.removeEventListener("keyup", this._key_callback);
        this.canvas.removeEventListener("contextmenu", this._doNothing);
        this.canvas.removeEventListener("drop", this._ondrop_callback);
        this.canvas.removeEventListener("dragenter", this._doReturnTrue);

        //touch events -- THIS WAY DOES NOT WORK, finish implementing pointerevents, than clean the touchevents
        /*this.canvas.removeEventListener("touchstart", this._touch_callback );
        this.canvas.removeEventListener("touchmove", this._touch_callback );
        this.canvas.removeEventListener("touchend", this._touch_callback );
        this.canvas.removeEventListener("touchcancel", this._touch_callback );*/

        this._mousedown_callback = null;
        this._mousewheel_callback = null;
        this._key_callback = null;
        this._ondrop_callback = null;

        this._events_binded = false;
    };

    LGraphCanvas.getFileExtension = function(url) {
        var question = url.indexOf("?");
        if (question != -1) {
            url = url.substr(0, question);
        }
        var point = url.lastIndexOf(".");
        if (point == -1) {
            return "";
        }
        return url.substr(point + 1).toLowerCase();
    };

    /**
     * this function allows to render the canvas using WebGL instead of Canvas2D
     * this is useful if you plant to render 3D objects inside your nodes, it uses litegl.js for webgl and canvas2DtoWebGL to emulate the Canvas2D calls in webGL
     * @method enableWebGL
     **/
    LGraphCanvas.prototype.enableWebGL = function() {
        if (typeof GL === undefined) {
            throw "litegl.js must be included to use a WebGL canvas";
        }
        if (typeof enableWebGLCanvas === undefined) {
            throw "webglCanvas.js must be included to use this feature";
        }

        this.gl = this.ctx = enableWebGLCanvas(this.canvas);
        this.ctx.webgl = true;
        this.bgcanvas = this.canvas;
        this.bgctx = this.gl;
        this.canvas.webgl_enabled = true;
    };

    /**
     * marks as dirty the canvas, this way it will be rendered again
     *
     * @class LGraphCanvas
     * @method setDirty
     * @param {bool} fgcanvas if the foreground canvas is dirty (the one containing the nodes)
     * @param {bool} bgcanvas if the background canvas is dirty (the one containing the wires)
     */
    LGraphCanvas.prototype.setDirty = function(fgcanvas, bgcanvas) {
        if (fgcanvas) {
            this.dirty_canvas = true;
        }
        if (bgcanvas) {
            this.dirty_bgcanvas = true;
        }
    };

    /**
     * Used to attach the canvas in a popup
     *
     * @method getCanvasWindow
     * @return {window} returns the window where the canvas is attached (the DOM root node)
     */
    LGraphCanvas.prototype.getCanvasWindow = function() {
        if (!this.canvas) {
            return window;
        }
        var doc = this.canvas.ownerDocument;
        return doc.defaultView || doc.parentWindow;
    };

    /**
     * starts rendering the content of the canvas when needed
     *
     * @method startRendering
     */
    LGraphCanvas.prototype.startRendering = function() {
        if (this.is_rendering) {
            return;
        } //already rendering

        this.is_rendering = true;
        renderFrame.call(this);

        function renderFrame() {
            if (!this.pause_rendering) {
                this.draw();
            }

            var window = this.getCanvasWindow();
            if (this.is_rendering) {
                window.requestAnimationFrame(renderFrame.bind(this));
            }
        }
    };

    /**
     * stops rendering the content of the canvas (to save resources)
     *
     * @method stopRendering
     */
    LGraphCanvas.prototype.stopRendering = function() {
        this.is_rendering = false;
    };

    /* LiteGraphCanvas input */

	//used to block future mouse events (because of im gui)
	LGraphCanvas.prototype.blockClick = function()
	{
		this.block_click = true;
		this.last_mouseclick = 0;
	}

    LGraphCanvas.prototype.processMouseDown = function(e) {

		if( this.set_canvas_dirty_on_mouse_event )
			this.dirty_canvas = true;

		if (!this.graph) {
            return;
        }

        this.adjustMouseEvent(e);

        var ref_window = this.getCanvasWindow();
        var document = ref_window.document;
        LGraphCanvas.active_canvas = this;
        var that = this;

		var x = e.clientX;
		var y = e.clientY;
		this.ds.viewport = this.viewport;
		var is_inside = !this.viewport || ( this.viewport && x >= this.viewport[0] && x < (this.viewport[0] + this.viewport[2]) && y >= this.viewport[1] && y < (this.viewport[1] + this.viewport[3]) );

        //move mouse move event to the window in case it drags outside of the canvas
		if(!this.options.skip_events)
		{
			LiteGraph.pointerListenerRemove(this.canvas,"move", this._mousemove_callback);
			LiteGraph.pointerListenerAdd(ref_window.document,"move", this._mousemove_callback,true); //catch for the entire window
			LiteGraph.pointerListenerAdd(ref_window.document,"up", this._mouseup_callback,true);
		}

		if(!is_inside){
			return;
		}

        var node = this.graph.getNodeOnPos( e.canvasX, e.canvasY, this.visible_nodes, 5 );
        var skip_action = false;
        var now = LiteGraph.getTime();
		var is_primary = (e.isPrimary === undefined || !e.isPrimary);
        var is_double_click = (now - this.last_mouseclick < 300) && is_primary;
		this.mouse[0] = e.clientX;
		this.mouse[1] = e.clientY;
        this.graph_mouse[0] = e.canvasX;
        this.graph_mouse[1] = e.canvasY;
		this.last_click_position = [this.mouse[0],this.mouse[1]];

	  	if (this.pointer_is_down && is_primary ){
		  this.pointer_is_double = true;
		}else{
		  this.pointer_is_double = false;
		}
	  	this.pointer_is_down = true;


        this.canvas.focus();

        LiteGraph.closeAllContextMenus(ref_window);

        if (this.onMouse)
		{
            if (this.onMouse(e) == true)
                return;
        }

		//left button mouse / single finger
        if (e.which == 1 && !this.pointer_is_double)
		{
            // clone node ALT dragging
            if (LiteGraph.alt_drag_do_clone_nodes && e.altKey && node && this.allow_interaction && !skip_action && !this.read_only)
            {
                if (cloned = node.clone()){
                    cloned.pos[0] += 5;
                    cloned.pos[1] += 5;
                    this.graph.add(cloned,false,{doCalcSize: false});
                    node = cloned;
                    skip_action = true;
                    if (!block_drag_node) {
                        if (this.allow_dragnodes) {
							this.graph.beforeChange();
                            this.node_dragged = node;
                        }
                        if (!this.selected_nodes[node.id]) {
                            this.processNodeSelected(node, e);
                        }
                    }
                }
            }

            var clicking_canvas_bg = false;

            //when clicked on top of a node
            //and it is not interactive
            if (node && this.allow_interaction && !skip_action && !this.read_only) {
                if (!this.live_mode && !node.flags.pinned) {
                    this.bringToFront(node);
                } //if it wasn't selected?

                //not dragging mouse to connect two slots
                if ( !this.connecting_node && !node.flags.collapsed && !this.live_mode ) {
                    //Search for corner for resize
                    if ( !skip_action &&
                        node.resizable !== false &&
                        isInsideRectangle( e.canvasX,
                            e.canvasY,
                            node.pos[0] + node.size[0] - 5,
                            node.pos[1] + node.size[1] - 5,
                            10,
                            10
                        )
                    ) {
						this.graph.beforeChange();
                        this.resizing_node = node;
                        this.canvas.style.cursor = "se-resize";
                        skip_action = true;
                    } else {
                        //search for outputs
                        if (node.outputs) {
                            for ( var i = 0, l = node.outputs.length; i < l; ++i ) {
                                var output = node.outputs[i];
                                var link_pos = node.getConnectionPos(false, i);
                                if (
                                    isInsideRectangle(
                                        e.canvasX,
                                        e.canvasY,
                                        link_pos[0] - 15,
                                        link_pos[1] - 10,
                                        30,
                                        20
                                    )
                                ) {
                                    this.connecting_node = node;
                                    this.connecting_output = output;
                                    this.connecting_output.slot_index = i;
                                    this.connecting_pos = node.getConnectionPos( false, i );
                                    this.connecting_slot = i;

                                    if (LiteGraph.shift_click_do_break_link_from){
                                        if (e.shiftKey) {
                                            node.disconnectOutput(i);
                                        }
                                    }

                                    if (is_double_click) {
                                        if (node.onOutputDblClick) {
                                            node.onOutputDblClick(i, e);
                                        }
                                    } else {
                                        if (node.onOutputClick) {
                                            node.onOutputClick(i, e);
                                        }
                                    }

                                    skip_action = true;
                                    break;
                                }
                            }
                        }

                        //search for inputs
                        if (node.inputs) {
                            for ( var i = 0, l = node.inputs.length; i < l; ++i ) {
                                var input = node.inputs[i];
                                var link_pos = node.getConnectionPos(true, i);
                                if (
                                    isInsideRectangle(
                                        e.canvasX,
                                        e.canvasY,
                                        link_pos[0] - 15,
                                        link_pos[1] - 10,
                                        30,
                                        20
                                    )
                                ) {
                                    if (is_double_click) {
                                        if (node.onInputDblClick) {
                                            node.onInputDblClick(i, e);
                                        }
                                    } else {
                                        if (node.onInputClick) {
                                            node.onInputClick(i, e);
                                        }
                                    }

                                    if (input.link !== null) {
                                        var link_info = this.graph.links[
                                            input.link
                                        ]; //before disconnecting
                                        if (LiteGraph.click_do_break_link_to){
                                            node.disconnectInput(i);
                                            this.dirty_bgcanvas = true;
                                            skip_action = true;
                                        }else{
                                            // do same action as has not node ?
                                        }

                                        if (
                                            this.allow_reconnect_links ||
											//this.move_destination_link_without_shift ||
                                            e.shiftKey
                                        ) {
                                            if (!LiteGraph.click_do_break_link_to){
                                                node.disconnectInput(i);
                                            }
                                            this.connecting_node = this.graph._nodes_by_id[
                                                link_info.out_node_id
                                            ];
                                            this.connecting_slot =
                                                link_info.out_slot_name;
                                            this.connecting_output = this.connecting_node.outputs[
                                                this.connecting_slot
                                            ];
                                            this.connecting_pos = this.connecting_node.getConnectionPos( false, this.connecting_slot );

                                            this.dirty_bgcanvas = true;
                                            skip_action = true;
                                        }


                                    }else{
                                        // has not node
                                    }

                                    if (!skip_action){
                                        // connect from in to out, from to to from
                                        this.connecting_node = node;
                                        this.connecting_input = input;
                                        this.connecting_input.slot_index = i;
                                        this.connecting_pos = node.getConnectionPos( true, i );
                                        this.connecting_slot = i;

                                        this.dirty_bgcanvas = true;
                                        skip_action = true;
                                    }
                                }
                            }
                        }
                    } //not resizing
                }

                //it wasn't clicked on the links boxes
                if (!skip_action) {
                    var block_drag_node = false;
					var pos = [e.canvasX - node.pos[0], e.canvasY - node.pos[1]];

                    //widgets
                    var widget = this.processNodeWidgets( node, this.graph_mouse, e );
                    if (widget) {
                        block_drag_node = true;
                        this.node_widget = [node, widget];
                    }

                    //double clicking
                    if (is_double_click && this.selected_nodes[node.id]) {
                        //double click node
                        if (node.onDblClick) {
                            node.onDblClick( e, pos, this );
                        }
                        this.processNodeDblClicked(node);
                        block_drag_node = true;
                    }

                    //if do not capture mouse
                    if ( node.onMouseDown && node.onMouseDown( e, pos, this ) ) {
                        block_drag_node = true;
                    } else {
						//open function definition button
						if(node.subgraph && !node.skip_subgraph_button)
						{
							if ( !node.flags.collapsed && pos[0] > node.size[0] - LiteGraph.NODE_TITLE_HEIGHT && pos[1] < 0 ) {
								var that = this;
								setTimeout(function() {
									that.openFunctionDefinition(node.subgraph);
								}, 10);
							}
						}

						if (this.live_mode) {
							clicking_canvas_bg = true;
	                        block_drag_node = true;
						}
                    }

                    if (!block_drag_node) {
                        if (this.allow_dragnodes) {
							this.graph.beforeChange();
                            this.node_dragged = node;
                        }
                        if (!this.selected_nodes[node.id]) {
                            this.processNodeSelected(node, e);
                        }
                    }

                    this.dirty_canvas = true;
                }
            } //clicked outside of nodes
            else {
				if (!skip_action){
					//search for link connector
					if(!this.read_only) {
						for (var i = 0; i < this.visible_links.length; ++i) {
							var link = this.visible_links[i];
							var center = link._pos;
							if (
								!center ||
								e.canvasX < center[0] - 4 ||
								e.canvasX > center[0] + 4 ||
								e.canvasY < center[1] - 4 ||
								e.canvasY > center[1] + 4
							) {
								continue;
							}
							//link clicked
							this.showLinkMenu(link, e);
							this.over_link_center = null; //clear tooltip
							break;
						}
					}

					this.selected_comment = this.graph.getCommentOnPos( e.canvasX, e.canvasY );
					this.selected_comment_resizing_x = 0;
                    this.selected_comment_resizing_y = 0;
					if (this.selected_comment && !this.read_only ) {
                        skip_action = true;
                        var dist_left  = Math.abs(e.canvasX - this.selected_comment.pos[0]);
                        var dist_right = Math.abs(e.canvasX - this.selected_comment.pos[0] - this.selected_comment.size[0]);

                        var dist_top    = Math.abs(e.canvasY - this.selected_comment.pos[1]);
                        var dist_bottom = Math.abs(e.canvasY - this.selected_comment.pos[1] - this.selected_comment.size[1]);
						let no_resize = true;

                        if (dist_left * this.ds.scale < 10) {
							this.selected_comment_resizing_x = -1;
                            no_resize = false;
						} else if (dist_right * this.ds.scale < 10) {
							this.selected_comment_resizing_x = 1;
                            no_resize = false;
                        }
                        if (dist_top * this.ds.scale < 10) {
							this.selected_comment_resizing_y = -1;
                            no_resize = false;
                        } else if (dist_bottom * this.ds.scale < 10) {
							this.selected_comment_resizing_y = 1;
                            no_resize = false;
                        }

                        if(no_resize) {
							this.selected_comment.recomputeInsideNodes();
						}
					}

					if (is_double_click && !this.read_only && this.allow_searchbox) {
						this.showSearchBox(e);
						e.preventDefault();
						e.stopPropagation();
					}

					clicking_canvas_bg = true;
				}
            }

            if(!skip_action && clicking_canvas_bg){
                this.dragging_rectangle = new Float32Array(4);
                this.dragging_rectangle[0] = e.canvasX;
                this.dragging_rectangle[1] = e.canvasY;
                this.dragging_rectangle[2] = 1;
                this.dragging_rectangle[3] = 1;
            }

        } else if (e.which == 2) {
            //middle button

			if (LiteGraph.middle_click_slot_add_default_node){
				if (node && this.allow_interaction && !skip_action && !this.read_only){
					//not dragging mouse to connect two slots
					if (
						!this.connecting_node &&
						!node.flags.collapsed &&
						!this.live_mode
					) {
						var mClikSlot = false;
						var mClikSlot_index = false;
						var mClikSlot_isOut = false;
						//search for outputs
						if (node.outputs) {
							for ( var i = 0, l = node.outputs.length; i < l; ++i ) {
								var output = node.outputs[i];
								var link_pos = node.getConnectionPos(false, i);
								if (isInsideRectangle(e.canvasX,e.canvasY,link_pos[0] - 15,link_pos[1] - 10,30,20)) {
									mClikSlot = output;
									mClikSlot_index = i;
									mClikSlot_isOut = true;
									break;
								}
							}
						}

						//search for inputs
						if (node.inputs) {
							for ( var i = 0, l = node.inputs.length; i < l; ++i ) {
								var input = node.inputs[i];
								var link_pos = node.getConnectionPos(true, i);
								if (isInsideRectangle(e.canvasX,e.canvasY,link_pos[0] - 15,link_pos[1] - 10,30,20)) {
									mClikSlot = input;
									mClikSlot_index = i;
									mClikSlot_isOut = false;
									break;
								}
							}
						}
						//console.log("middleClickSlots? "+mClikSlot+" & "+(mClikSlot_index!==false));
						if (mClikSlot && mClikSlot_index!==false){

							var alphaPosY = 0.5-((mClikSlot_index+1)/((mClikSlot_isOut?node.outputs.length:node.inputs.length)));
							var node_bounding = node.getBounding();
							// estimate a position: this is a bad semi-bad-working mess .. REFACTOR with a correct autoplacement that knows about the others slots and nodes
							var posRef = [	(!mClikSlot_isOut?node_bounding[0]:node_bounding[0]+node_bounding[2])// + node_bounding[0]/this.canvas.width*150
											,e.canvasY-80// + node_bounding[0]/this.canvas.width*66 // vertical "derive"
										  ];
							var nodeCreated = this.createDefaultNodeForSlot({   	nodeFrom: !mClikSlot_isOut?null:node
																					,slotFrom: !mClikSlot_isOut?null:mClikSlot_index
																					,nodeTo: !mClikSlot_isOut?node:null
																					,slotTo: !mClikSlot_isOut?mClikSlot_index:null
																					,position: posRef //,e: e
																					,nodeType: "AUTO" //nodeNewType
																					,posAdd:[!mClikSlot_isOut?-30:30, -alphaPosY*130] //-alphaPosY*30]
																					,posSizeFix:[!mClikSlot_isOut?-1:0, 0] //-alphaPosY*2*/
																				});

						}
					}
				}
			}

        } else if (e.which == 3 || this.pointer_is_double) {
            this.just_pressed_rmb = true;

            //wait for 100ms to start dragging the canvas
            var that = this;
            setTimeout(
                function(){
                    if(!that.just_pressed_rmb)
                        return;

                    that.dragging_canvas = true;
                    that.just_pressed_rmb = false;
                }

            ,100);

        }

        //TODO
        //if(this.node_selected != prev_selected)
        //	this.onNodeSelectionChange(this.node_selected);

        this.last_mouse[0] = e.clientX;
        this.last_mouse[1] = e.clientY;
        this.last_mouseclick = LiteGraph.getTime();
        this.last_mouse_dragging = true;

        this.graph.change();

        //this is to ensure to defocus(blur) if a text input element is on focus
        if (
            !ref_window.document.activeElement ||
            (ref_window.document.activeElement.nodeName.toLowerCase() !=
                "input" &&
                ref_window.document.activeElement.nodeName.toLowerCase() !=
                    "textarea")
        ) {
            e.preventDefault();
        }
        e.stopPropagation();

        if (this.onMouseDown) {
            this.onMouseDown(e);
        }

        return false;
    };

    /**
     * Called when a mouse move event has to be processed
     * @method processMouseMove
     **/
    LGraphCanvas.prototype.processMouseMove = function(e) {
        if (this.autoresize) {
            this.resize();
        }

		if( this.set_canvas_dirty_on_mouse_event )
			this.dirty_canvas = true;

        if (!this.graph) {
            return;
        }

        LGraphCanvas.active_canvas = this;
        this.adjustMouseEvent(e);
        var mouse = [e.clientX, e.clientY];
		this.mouse[0] = mouse[0];
		this.mouse[1] = mouse[1];
        var delta = [
            mouse[0] - this.last_mouse[0],
            mouse[1] - this.last_mouse[1]
        ];
        this.last_mouse = mouse;
        this.graph_mouse[0] = e.canvasX;
        this.graph_mouse[1] = e.canvasY;

        //console.log("pointerevents: processMouseMove "+e.pointerId+" "+e.isPrimary);

		if(this.block_click)
		{
			//console.log("pointerevents: processMouseMove block_click");
			e.preventDefault();
			return false;
		}

        e.dragging = this.last_mouse_dragging;

        if (this.node_widget) {
            this.processNodeWidgets(
                this.node_widget[0],
                this.graph_mouse,
                e,
                this.node_widget[1]
            );
            this.dirty_canvas = true;
        }

        if (this.dragging_rectangle)
		{
            this.dragging_rectangle[2] = e.canvasX - this.dragging_rectangle[0];
            this.dragging_rectangle[3] = e.canvasY - this.dragging_rectangle[1];
            this.dirty_canvas = true;
        }
		else if (this.selected_comment && !this.read_only)
		{
            //moving/resizing a comment
            if (this.selected_comment_resizing_x != 0 || this.selected_comment_resizing_y != 0) {
                if(this.selected_comment_resizing_x>0){
                    this.selected_comment.size[0] = e.canvasX - this.selected_comment.pos[0];
                } else if (this.selected_comment_resizing_x<0){
                    this.selected_comment.size[0] = -e.canvasX + this.selected_comment.pos[0] + this.selected_comment.size[0];
                    this.selected_comment.pos[0] = e.canvasX;
                }

                if(this.selected_comment_resizing_y>0){
                    this.selected_comment.size[1] = e.canvasY - this.selected_comment.pos[1];
                } else if (this.selected_comment_resizing_y<0){
                    this.selected_comment.size[1] = -e.canvasY + this.selected_comment.pos[1] + this.selected_comment.size[1];
                    this.selected_comment.pos[1] = e.canvasY;
                }
            } else {
                var deltax = delta[0] / this.ds.scale;
                var deltay = delta[1] / this.ds.scale;
                this.selected_comment.move(deltax, deltay, e.ctrlKey);
                if (this.selected_comment._nodes.length) {
                    this.dirty_canvas = true;
                }
            }
            this.dirty_bgcanvas = true;
        } else if (this.dragging_canvas) {
        	////console.log("pointerevents: processMouseMove is dragging_canvas");
            this.ds.offset[0] += delta[0] / this.ds.scale;
            this.ds.offset[1] += delta[1] / this.ds.scale;
            this.dirty_canvas = true;
            this.dirty_bgcanvas = true;
        } else if (this.allow_interaction && !this.read_only) {
            if (this.connecting_node) {
                this.dirty_canvas = true;
            }

            //get node over
            var node = this.graph.getNodeOnPos(e.canvasX,e.canvasY,this.visible_nodes);

            //remove mouseover flag
            for (var i = 0, l = this.graph._nodes.length; i < l; ++i) {
                if (this.graph._nodes[i].mouseOver && node != this.graph._nodes[i] ) {
                    //mouse leave
                    this.graph._nodes[i].mouseOver = false;
                    if (this.node_over && this.node_over.onMouseLeave) {
                        this.node_over.onMouseLeave(e);
                    }
                    this.node_over = null;
                    this.dirty_canvas = true;
                }
            }

            //mouse over a node
            if (node) {

				if(node.redraw_on_mouse)
                    this.dirty_canvas = true;

                //this.canvas.style.cursor = "move";
                if (!node.mouseOver) {
                    //mouse enter
                    node.mouseOver = true;
                    this.node_over = node;
                    this.dirty_canvas = true;

                    if (node.onMouseEnter) {
                        node.onMouseEnter(e);
                    }
                }

                //in case the node wants to do something
                if (node.onMouseMove) {
                    node.onMouseMove( e, [e.canvasX - node.pos[0], e.canvasY - node.pos[1]], this );
                }

                //if dragging a link
                if (this.connecting_node) {

                    if (this.connecting_output){

                        var pos = this._highlight_input || [0, 0]; //to store the output of isOverNodeInput

                        //on top of input
                        if (this.isOverNodeBox(node, e.canvasX, e.canvasY)) {
                            //mouse on top of the corner box, don't know what to do
                        } else {
                            //check if I have a slot below de mouse
                            var slot = this.isOverNodeInput( node, e.canvasX, e.canvasY, pos );
                            if (slot != -1 && node.inputs[slot]) {
                                var slot_type = node.inputs[slot].type;
                                if ( LiteGraph.isDataTypeMatch( this.connecting_output.type, slot_type ) ) {
                                    this._highlight_input = pos;
									this._highlight_input_slot = node.inputs[slot]; // XXX CHECK THIS
                                }
                            } else {
                                this._highlight_input = null;
								this._highlight_input_slot = null;  // XXX CHECK THIS
                            }
                        }

                    }else if(this.connecting_input){

                        var pos = this._highlight_output || [0, 0]; //to store the output of isOverNodeOutput

                        //on top of output
                        if (this.isOverNodeBox(node, e.canvasX, e.canvasY)) {
                            //mouse on top of the corner box, don't know what to do
                        } else {
                            //check if I have a slot below de mouse
                            var slot = this.isOverNodeOutput( node, e.canvasX, e.canvasY, pos );
                            if (slot != -1 && node.outputs[slot]) {
                                var slot_type = node.outputs[slot].type;
                                if ( LiteGraph.isDataTypeMatch( this.connecting_input.type, slot_type ) ) {
                                    this._highlight_output = pos;
                                }
                            } else {
                                this._highlight_output = null;
                            }
                        }
                    }
                }

                //Search for corner
                if (this.canvas) {
                    if (
                        isInsideRectangle(
                            e.canvasX,
                            e.canvasY,
                            node.pos[0] + node.size[0] - 5,
                            node.pos[1] + node.size[1] - 5,
                            5,
                            5
                        )
                    ) {
                        this.canvas.style.cursor = "se-resize";
                    } else {
                        this.canvas.style.cursor = "crosshair";
                    }
                }
            } else { //not over a node

                //search for link connector
				var over_link = null;
				for (var i = 0; i < this.visible_links.length; ++i) {
					var link = this.visible_links[i];
					var center = link._pos;
					if (
						!center ||
						e.canvasX < center[0] - 4 ||
						e.canvasX > center[0] + 4 ||
						e.canvasY < center[1] - 4 ||
						e.canvasY > center[1] + 4
					) {
						continue;
					}
					over_link = link;
					break;
				}
				if( over_link != this.over_link_center )
				{
					this.over_link_center = over_link;
	                this.dirty_canvas = true;
				}

				if (this.canvas) {
	                this.canvas.style.cursor = "";
				}
			} //end

			//send event to node if capturing input (used with widgets that allow drag outside of the area of the node)
            if ( this.node_capturing_input && this.node_capturing_input != node && this.node_capturing_input.onMouseMove ) {
                this.node_capturing_input.onMouseMove(e,[e.canvasX - this.node_capturing_input.pos[0],e.canvasY - this.node_capturing_input.pos[1]], this);
            }

			//node being dragged
            if (this.node_dragged && !this.live_mode) {
				//console.log("draggin!",this.selected_nodes);
                for (var i in this.selected_nodes) {
                    var n = this.selected_nodes[i];
                    n.pos[0] += delta[0] / this.ds.scale;
                    n.pos[1] += delta[1] / this.ds.scale;
                }

                this.dirty_canvas = true;
                this.dirty_bgcanvas = true;
            }

            if (this.resizing_node && !this.live_mode) {
                //convert mouse to node space
				var desired_size = [ e.canvasX - this.resizing_node.pos[0], e.canvasY - this.resizing_node.pos[1] ];
				var min_size = this.resizing_node.computeSize();
				desired_size[0] = Math.max( min_size[0], desired_size[0] );
				desired_size[1] = Math.max( min_size[1], desired_size[1] );
				this.resizing_node.setSize( desired_size );

                this.canvas.style.cursor = "se-resize";
                this.dirty_canvas = true;
                this.dirty_bgcanvas = true;
            }
        }

        e.preventDefault();
        return false;
    };

    /**
     * Called when a mouse up event has to be processed
     * @method processMouseUp
     **/
    LGraphCanvas.prototype.processMouseUp = function(e) {

		var is_primary = ( e.isPrimary === undefined || e.isPrimary );

    	//early exit for extra pointer
    	if(!is_primary){
    		/*e.stopPropagation();
        	e.preventDefault();*/
    		//console.log("pointerevents: processMouseUp pointerN_stop "+e.pointerId+" "+e.isPrimary);
    		return false;
    	}

    	//console.log("pointerevents: processMouseUp "+e.pointerId+" "+e.isPrimary+" :: "+e.clientX+" "+e.clientY);

		if( this.set_canvas_dirty_on_mouse_event )
			this.dirty_canvas = true;

        if (!this.graph)
            return;

        var window = this.getCanvasWindow();
        var document = window.document;
        LGraphCanvas.active_canvas = this;

        //restore the mousemove event back to the canvas
		if(!this.options.skip_events)
		{
			//console.log("pointerevents: processMouseUp adjustEventListener");
			LiteGraph.pointerListenerRemove(document,"move", this._mousemove_callback,true);
			LiteGraph.pointerListenerAdd(this.canvas,"move", this._mousemove_callback,true);
			LiteGraph.pointerListenerRemove(document,"up", this._mouseup_callback,true);
		}

        this.adjustMouseEvent(e);
        var now = LiteGraph.getTime();
        e.click_time = now - this.last_mouseclick;
        this.last_mouse_dragging = false;
		this.last_click_position = null;

		if(this.block_click)
		{
			//console.log("pointerevents: processMouseUp block_clicks");
			this.block_click = false; //used to avoid sending twice a click in a immediate button
		}

        if(this.frozen_view){
            this.frozen_view = null;
        }

		//console.log("pointerevents: processMouseUp which: "+e.which);

        if (e.which == 1) {

			if( this.node_widget )
			{
				this.processNodeWidgets( this.node_widget[0], this.graph_mouse, e );
			}

            //left button
            this.node_widget = null;

            if (this.selected_comment) {
                var diffx =
                    this.selected_comment.pos[0] -
                    Math.round(this.selected_comment.pos[0]);
                var diffy =
                    this.selected_comment.pos[1] -
                    Math.round(this.selected_comment.pos[1]);
                this.selected_comment.move(diffx, diffy, e.ctrlKey);
                this.selected_comment.pos[0] = Math.round(
                    this.selected_comment.pos[0]
                );
                this.selected_comment.pos[1] = Math.round(
                    this.selected_comment.pos[1]
                );
                if (this.selected_comment._nodes.length) {
                    this.dirty_canvas = true;
                }
                this.selected_comment = null;
            }
            this.selected_comment_resizing_x = 0;
            this.selected_comment_resizing_y = 0;

			var node = this.graph.getNodeOnPos(
							e.canvasX,
							e.canvasY,
							this.visible_nodes
						);

            if (this.dragging_rectangle) {
                if (this.graph) {
                    var nodes = this.graph._nodes;
                    var node_bounding = new Float32Array(4);

                    //compute bounding and flip if left to right
                    var w = Math.abs(this.dragging_rectangle[2]);
                    var h = Math.abs(this.dragging_rectangle[3]);
                    var startx =
                        this.dragging_rectangle[2] < 0
                            ? this.dragging_rectangle[0] - w
                            : this.dragging_rectangle[0];
                    var starty =
                        this.dragging_rectangle[3] < 0
                            ? this.dragging_rectangle[1] - h
                            : this.dragging_rectangle[1];
                    this.dragging_rectangle[0] = startx;
                    this.dragging_rectangle[1] = starty;
                    this.dragging_rectangle[2] = w;
                    this.dragging_rectangle[3] = h;

					// test dragging rect size, if minimun simulate a click
					if (!node || (w > 10 && h > 10 )){
						//test against all nodes (not visible because the rectangle maybe start outside
						var to_select = [];
						for (var i = 0; i < nodes.length; ++i) {
							var nodeX = nodes[i];
							nodeX.getBounding(node_bounding);
							if (
								!overlapBounding(
									this.dragging_rectangle,
									node_bounding
								)
							) {
								continue;
							} //out of the visible area
							to_select.push(nodeX);
						}
						if (to_select.length) {
							this.selectNodes(to_select,e.shiftKey); // add to selection with shift
						}
					}else{
						// will select of update selection
						this.selectNodes([node],e.shiftKey||e.ctrlKey); // add to selection add to selection with ctrlKey or shiftKey
					}

                }
                this.dragging_rectangle = null;
            } else if (this.connecting_node) {
                //dragging a connection
                this.dirty_canvas = true;
                this.dirty_bgcanvas = true;

                var connInOrOut = this.connecting_output || this.connecting_input;
                var connType = connInOrOut.type;

                //node below mouse
                if (node) {
                        if (this.connecting_output){

                            var slot = this.isOverNodeInput(
                                node,
                                e.canvasX,
                                e.canvasY
                            );
                            if (slot != -1) {
                                this.connecting_node.connect(this.connecting_slot, node, slot);
                            } else {
                                //not on top of an input
                                // look for a good slot
                                this.connecting_node.connectByType(this.connecting_slot,node,connType);
                            }

                        }else if (this.connecting_input){

                            var slot = this.isOverNodeOutput(
                                node,
                                e.canvasX,
                                e.canvasY
                            );

                            if (slot != -1) {
                                node.connect(slot, this.connecting_node, this.connecting_slot); // this is inverted has output-input nature like
                            } else {
                                //not on top of an input
                                // look for a good slot
                                this.connecting_node.connectByTypeOutput(this.connecting_slot,node,connType);
                            }

                        }
                }else{

                    // add menu when releasing link in empty space
                	if (LiteGraph.release_link_on_empty_shows_menu){
	                    if (e.shiftKey && this.allow_searchbox){
	                        if(this.connecting_output){
	                            this.showSearchBox(e,{node_from: this.connecting_node, slot_from: this.connecting_output, type_filter_in: this.connecting_output.type});
	                        }else if(this.connecting_input){
	                            this.showSearchBox(e,{node_to: this.connecting_node, slot_from: this.connecting_input, type_filter_out: this.connecting_input.type});
	                        }
	                    }else{
	                        if(this.connecting_output){
	                            this.showConnectionMenu({nodeFrom: this.connecting_node, slotFrom: this.connecting_output, e: e});
	                        }else if(this.connecting_input){
	                            this.showConnectionMenu({nodeTo: this.connecting_node, slotTo: this.connecting_input, e: e});
	                        }
	                    }
                	}
                }

                this.connecting_output = null;
                this.connecting_input = null;
                this.connecting_pos = null;
                this.connecting_node = null;
                this.connecting_slot = -1;
            } //not dragging connection
            else if (this.resizing_node) {
                this.dirty_canvas = true;
                this.dirty_bgcanvas = true;
				this.graph.afterChange(this.resizing_node);
                this.resizing_node = null;
            } else if (this.node_dragged) {
                //node being dragged?
                var node = this.node_dragged;

                this.dirty_canvas = true;
                this.dirty_bgcanvas = true;
                this.node_dragged.pos[0] = Math.round(this.node_dragged.pos[0]);
                this.node_dragged.pos[1] = Math.round(this.node_dragged.pos[1]);
				if( this.onNodeMoved )
					this.onNodeMoved( this.node_dragged );
				this.graph.afterChange(this.node_dragged);
                this.node_dragged = null;
            } //no node being dragged
            else {
                //get node over
                var node = this.graph.getNodeOnPos(
                    e.canvasX,
                    e.canvasY,
                    this.visible_nodes
                );

                if (!node && e.click_time < 300) {
                    this.deselectAllNodes();
                }

                this.dirty_canvas = true;
                this.dragging_canvas = false;

                if (this.node_over && this.node_over.onMouseUp) {
                    this.node_over.onMouseUp( e, [ e.canvasX - this.node_over.pos[0], e.canvasY - this.node_over.pos[1] ], this );
                }
                if (
                    this.node_capturing_input &&
                    this.node_capturing_input.onMouseUp
                ) {
                    this.node_capturing_input.onMouseUp(e, [
                        e.canvasX - this.node_capturing_input.pos[0],
                        e.canvasY - this.node_capturing_input.pos[1]
                    ]);
                }
            }
        } else if (e.which == 2) {
            //middle button
            //trace("middle");
            this.dirty_canvas = true;
            this.dragging_canvas = false;
        } else if (e.which == 3) {
            //right button
            //trace("right");
            this.dirty_canvas = true;
            this.dragging_canvas = false;

            if(this.just_pressed_rmb){
                this.just_pressed_rmb = false;
			if (this.allow_interaction && !this.read_only){

				// is it hover a node ?
				if (node){
					if(Object.keys(this.selected_nodes).length
					   && (this.selected_nodes[node.id] || e.shiftKey || e.ctrlKey || e.metaKey)
					){
						// is multiselected or using shift to include the now node
						if (!this.selected_nodes[node.id]) this.selectNodes([node],true); // add this if not present
					}else{
						// update selection
						this.selectNodes([node]);
					}
				}

				// show menu on this node
				this.processContextMenu(node, e);
			}
            }

        }

	  	if (is_primary)
		{
			this.pointer_is_down = false;
			this.pointer_is_double = false;
		}

        this.graph.change();

        //console.log("pointerevents: processMouseUp stopPropagation");
        e.stopPropagation();
        e.preventDefault();
        return false;
    };

    /**
     * Called when a mouse wheel event has to be processed
     * @method processMouseWheel
     **/
    LGraphCanvas.prototype.processMouseWheel = function(e) {
        if (!this.graph || !this.allow_dragcanvas) {
            return;
        }

        var delta = e.wheelDeltaY != null ? e.wheelDeltaY : e.detail * -60;

        this.adjustMouseEvent(e);

		var x = e.clientX;
		var y = e.clientY;
		var is_inside = !this.viewport || ( this.viewport && x >= this.viewport[0] && x < (this.viewport[0] + this.viewport[2]) && y >= this.viewport[1] && y < (this.viewport[1] + this.viewport[3]) );
		if(!is_inside)
			return;

        var scale = this.ds.scale;

        if (delta > 0) {
            scale *= 1.1;
        } else if (delta < 0) {
            scale *= 1 / 1.1;
        }
        this.ds.changeScale(scale, [e.clientX, e.clientY]);

        this.graph.change();

        e.preventDefault();
        return false; // prevent default
    };

    /**
     * returns true if a position (in graph space) is on top of a node little corner box
     * @method isOverNodeBox
     **/
    LGraphCanvas.prototype.isOverNodeBox = function(node, canvasx, canvasy) {
        var title_height = LiteGraph.NODE_TITLE_HEIGHT;
        if (
            isInsideRectangle(
                canvasx,
                canvasy,
                node.pos[0] + 2,
                node.pos[1] + 2 - title_height,
                title_height - 4,
                title_height - 4
            )
        ) {
            return true;
        }
        return false;
    };

    /**
     * returns the INDEX if a position (in graph space) is on top of a node input slot
     * @method isOverNodeInput
     **/
    LGraphCanvas.prototype.isOverNodeInput = function(
        node,
        canvasx,
        canvasy,
        slot_pos
    ) {
        if (node.inputs) {
            for (var i = 0, l = node.inputs.length; i < l; ++i) {
                var input = node.inputs[i];
                var link_pos = node.getConnectionPos(true, i);
                var is_inside = false;
                is_inside = isInsideRectangle(
                    canvasx,
                    canvasy,
                    link_pos[0] - 10,
                    link_pos[1] - 5,
                    40,
                    10
                );
                if (is_inside) {
                    if (slot_pos) {
                        slot_pos[0] = link_pos[0];
                        slot_pos[1] = link_pos[1];
                    }
                    return i;
                }
            }
        }
        return -1;
    };

    /**
     * returns the INDEX if a position (in graph space) is on top of a node output slot
     * @method isOverNodeOuput
     **/
    LGraphCanvas.prototype.isOverNodeOutput = function(
        node,
        canvasx,
        canvasy,
        slot_pos
    ) {
        if (node.outputs) {
            for (var i = 0, l = node.outputs.length; i < l; ++i) {
                var output = node.outputs[i];
                var link_pos = node.getConnectionPos(false, i);
                var is_inside = false;
                is_inside = isInsideRectangle(
                    canvasx,
                    canvasy,
                    link_pos[0] - 10,
                    link_pos[1] - 5,
                    40,
                    10
                );
                if (is_inside) {
                    if (slot_pos) {
                        slot_pos[0] = link_pos[0];
                        slot_pos[1] = link_pos[1];
                    }
                    return i;
                }
            }
        }
        return -1;
    };

    /**
     * process a key event
     * @method processKey
     **/
    LGraphCanvas.prototype.processKey = function(e) {
        if (!this.graph) {
            return;
        }

        var block_default = false;
        //console.log(e); //debug

        if (e.target.localName == "input") {
            return;
        }

        if (e.type == "keydown") {
            if (e.keyCode == 32) {
                //space
                this.dragging_canvas = true;
                block_default = true;
            }

            if (e.keyCode == 27) {
                //esc
                if(this.node_panel) this.node_panel.close();
                if(this.options_panel) this.options_panel.close();
                block_default = true;
            }

            //select all Control A
            if (e.keyCode == 65 && e.ctrlKey) {
                this.selectNodes();
                block_default = true;
            }

            if (e.code == "KeyC" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
                //copy
                if (this.selected_nodes) {
                    this.copyToClipboard();
                    block_default = true;
                }
            }

            if (e.code == "KeyV" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
                //paste
                this.pasteFromClipboard();
            }

            //delete or backspace
            if (e.keyCode == 46 || e.keyCode == 8) {
                if (
                    e.target.localName != "input" &&
                    e.target.localName != "textarea"
                ) {
                    this.deleteSelectedNodes();
                    block_default = true;
                }
            }

            //collapse
            //...

            //TODO
            if (this.selected_nodes) {
                for (var i in this.selected_nodes) {
                    if (this.selected_nodes[i].onKeyDown) {
                        this.selected_nodes[i].onKeyDown(e);
                    }
                }
            }
        } else if (e.type == "keyup") {
            if (e.keyCode == 32) {
                // space
                this.dragging_canvas = false;
            }

            if (this.selected_nodes) {
                for (var i in this.selected_nodes) {
                    if (this.selected_nodes[i].onKeyUp) {
                        this.selected_nodes[i].onKeyUp(e);
                    }
                }
            }
        }

        this.graph.change();

        if (block_default) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return false;
        }
    };

    LGraphCanvas.prototype.copyToClipboard = function() {
        var clipboard_info = {
            nodes: [],
            links: []
        };
        var index = 0;
        var selected_nodes_array = [];
        for (var i in this.selected_nodes) {
            var node = this.selected_nodes[i];
            node._relative_id = index;
            selected_nodes_array.push(node);
            index += 1;
        }

        for (var i = 0; i < selected_nodes_array.length; ++i) {
            var node = selected_nodes_array[i];
			var cloned = node.clone();
			if(!cloned)
			{
				console.warn("node type not found: " + node.type );
				continue;
			}
            clipboard_info.nodes.push(cloned.serialize());
            if (node.inputs && node.inputs.length) {
                for (var j = 0; j < node.inputs.length; ++j) {
                    var input = node.inputs[j];
                    if (!input || input.link == null) {
                        continue;
                    }
                    var link_info = this.graph.links[input.link];
                    if (!link_info) {
                        continue;
                    }
                    var target_node = this.graph.getNodeById(
                        link_info.out_node_id
                    );
                    if (!target_node || !this.selected_nodes[target_node.id]) {
                        //improve this by allowing connections to non-selected nodes
                        continue;
                    } //not selected
                    clipboard_info.links.push([
                        target_node._relative_id,
                        link_info.out_slot_name, //j,
                        node._relative_id,
                        link_info.in_slot_name
                    ]);
                }
            }
        }
        localStorage.setItem(
            "litegrapheditor_clipboard",
            JSON.stringify(clipboard_info)
        );
    };

    LGraphCanvas.prototype.pasteFromClipboard = function() {
        var data = localStorage.getItem("litegrapheditor_clipboard");
        if (!data) {
            return;
        }

		this.graph.beforeChange();

        //create nodes
        var clipboard_info = JSON.parse(data);
        // calculate top-left node, could work without this processing but using diff with last node pos :: clipboard_info.nodes[clipboard_info.nodes.length-1].pos
        var posMin = false;
        var posMinIndexes = false;
        for (var i = 0; i < clipboard_info.nodes.length; ++i) {
            if (posMin){
                if(posMin[0]>clipboard_info.nodes[i].pos[0]){
                    posMin[0] = clipboard_info.nodes[i].pos[0];
                    posMinIndexes[0] = i;
                }
                if(posMin[1]>clipboard_info.nodes[i].pos[1]){
                    posMin[1] = clipboard_info.nodes[i].pos[1];
                    posMinIndexes[1] = i;
                }
            }
            else{
                posMin = [clipboard_info.nodes[i].pos[0], clipboard_info.nodes[i].pos[1]];
                posMinIndexes = [i, i];
            }
        }
        var nodes = [];
        for (var i = 0; i < clipboard_info.nodes.length; ++i) {
            var node_data = clipboard_info.nodes[i];
            var node = LiteGraph.createNode(node_data.type);
            if (node) {
                node.configure(node_data);

				//paste in last known mouse position
                node.pos[0] += this.graph_mouse[0] - posMin[0]; //+= 5;
                node.pos[1] += this.graph_mouse[1] - posMin[1]; //+= 5;

                this.graph.add(node,{doProcessChange:false});

                nodes.push(node);
            }
        }

        //create links
        for (var i = 0; i < clipboard_info.links.length; ++i) {
            var link_info = clipboard_info.links[i];
            var origin_node = nodes[link_info[0]];
            var target_node = nodes[link_info[2]];
			if( origin_node && target_node )
	            origin_node.connect(link_info[1], target_node, link_info[3]);
			else
				console.warn("Warning, nodes missing on pasting");
        }

        this.selectNodes(nodes);

		this.graph.afterChange();
    };

    /**
     * process a item drop event on top the canvas
     * @method processDrop
     **/
    LGraphCanvas.prototype.processDrop = function(e) {
        e.preventDefault();
        this.adjustMouseEvent(e);
		var x = e.clientX;
		var y = e.clientY;
		var is_inside = !this.viewport || ( this.viewport && x >= this.viewport[0] && x < (this.viewport[0] + this.viewport[2]) && y >= this.viewport[1] && y < (this.viewport[1] + this.viewport[3]) );
		if(!is_inside){
			return;
			// --- BREAK ---
		}

        var pos = [e.canvasX, e.canvasY];


        var node = this.graph ? this.graph.getNodeOnPos(pos[0], pos[1]) : null;

        if (!node) {
            var r = null;
            if (this.onDropItem) {
                r = this.onDropItem(event);
            }
            if (!r) {
                this.checkDropItem(e);
            }
            return;
        }

        if (node.onDropFile || node.onDropData) {
            var files = e.dataTransfer.files;
            if (files && files.length) {
                for (var i = 0; i < files.length; i++) {
                    var file = e.dataTransfer.files[0];
                    var filename = file.name;
                    var ext = LGraphCanvas.getFileExtension(filename);
                    //console.log(file);

                    if (node.onDropFile) {
                        node.onDropFile(file);
                    }

                    if (node.onDropData) {
                        //prepare reader
                        var reader = new FileReader();
                        reader.onload = function(event) {
                            //console.log(event.target);
                            var data = event.target.result;
                            node.onDropData(data, filename, file);
                        };

                        //read data
                        var type = file.type.split("/")[0];
                        if (type == "text" || type == "") {
                            reader.readAsText(file);
                        } else if (type == "image") {
                            reader.readAsDataURL(file);
                        } else {
                            reader.readAsArrayBuffer(file);
                        }
                    }
                }
            }
        }

        if (node.onDropItem) {
            if (node.onDropItem(event)) {
                return true;
            }
        }

        if (this.onDropItem) {
            return this.onDropItem(event);
        }

        return false;
    };

    //called if the graph doesn't have a default drop item behaviour
    LGraphCanvas.prototype.checkDropItem = function(e) {
        if (e.dataTransfer.files.length) {
            var file = e.dataTransfer.files[0];
            var ext = LGraphCanvas.getFileExtension(file.name).toLowerCase();
            var nodetype = LiteGraph.node_types_by_file_extension[ext];
            if (nodetype) {
				this.graph.beforeChange();
                var node = LiteGraph.createNode(nodetype.type);
                node.pos = [e.canvasX, e.canvasY];
                this.graph.add(node);
                if (node.onDropFile) {
                    node.onDropFile(file);
                }
				this.graph.afterChange();
            }
        }
    };

    LGraphCanvas.prototype.processNodeDblClicked = function(n) {
        if (this.onShowNodePanel) {
            this.onShowNodePanel(n);
        }
		else
		{
			this.showShowNodePanel(n);
		}

        if (this.onNodeDblClicked) {
            this.onNodeDblClicked(n);
        }

        this.setDirty(true);
    };

    LGraphCanvas.prototype.processNodeSelected = function(node, e) {
        this.selectNode(node, e && (e.shiftKey||e.ctrlKey));
        if (this.onNodeSelected) {
            this.onNodeSelected(node);
        }
    };

    /**
     * selects a given node (or adds it to the current selection)
     * @method selectNode
     **/
    LGraphCanvas.prototype.selectNode = function(
        node,
        add_to_current_selection
    ) {
        if (node == null) {
            this.deselectAllNodes();
        } else {
            this.selectNodes([node], add_to_current_selection);
        }
    };

    /* Creates a clone of this node */
    LGraphCanvas.prototype.clone = function(node) {
        var node = LiteGraph.createNode(node.type);
        if (!node) {
            return null;
        }

        //we clone it because serialize returns shared containers
        var data = LiteGraph.cloneObject(node.serialize());

        //remove links
        if (data.inputs) {
            for (var i = 0; i < data.inputs.length; ++i) {
                data.inputs[i].link = null;
            }
        }

        if (data.outputs) {
            for (var i = 0; i < data.outputs.length; ++i) {
                if (data.outputs[i].links) {
                    data.outputs[i].links.length = 0;
                }
            }
        }

        delete data["id"];
        //remove links
        node.configure(data);

        return node;
    };

    /**
     * selects several nodes (or adds them to the current selection)
     * @method selectNodes
     **/
    LGraphCanvas.prototype.selectNodes = function( nodes, add_to_current_selection )
	{
		if (!add_to_current_selection) {
            this.deselectAllNodes();
        }

        nodes = nodes || this.graph._nodes;
		if (typeof nodes == "string") nodes = [nodes];
        for (var i in nodes) {
            var node = nodes[i];
            if (node.is_selected) {
                continue;
            }

            if (!node.is_selected && node.onSelected) {
                node.onSelected();
            }
            node.is_selected = true;
            this.selected_nodes[node.id] = node;

            if (node.inputs) {
                for (var j = 0; j < node.inputs.length; ++j) {
                    this.highlighted_links[node.inputs[j].link] = true;
                }
            }
            if (node.outputs) {
                for (var j = 0; j < node.outputs.length; ++j) {
                    var out = node.outputs[j];
                    if (out.links) {
                        for (var k = 0; k < out.links.length; ++k) {
                            this.highlighted_links[out.links[k]] = true;
                        }
                    }
                }
            }
        }

		if(	this.onSelectionChange )
			this.onSelectionChange( this.selected_nodes );

        this.setDirty(true);
    };

    /**
     * removes a node from the current selection
     * @method deselectNode
     **/
    LGraphCanvas.prototype.deselectNode = function(node) {
        if (!node.is_selected) {
            return;
        }
        if (node.onDeselected) {
            node.onDeselected();
        }
        node.is_selected = false;

        if (this.onNodeDeselected) {
            this.onNodeDeselected(node);
        }

        //remove highlighted
        if (node.inputs) {
            for (var i = 0; i < node.inputs.length; ++i) {
                delete this.highlighted_links[node.inputs[i].link];
            }
        }
        if (node.outputs) {
            for (var i = 0; i < node.outputs.length; ++i) {
                var out = node.outputs[i];
                if (out.links) {
                    for (var j = 0; j < out.links.length; ++j) {
                        delete this.highlighted_links[out.links[j]];
                    }
                }
            }
        }
    };

    /**
     * removes all nodes from the current selection
     * @method deselectAllNodes
     **/
    LGraphCanvas.prototype.deselectAllNodes = function() {
        if (!this.graph) {
            return;
        }
        var nodes = this.graph._nodes;
        for (var i = 0, l = nodes.length; i < l; ++i) {
            var node = nodes[i];
            if (!node.is_selected) {
                continue;
            }
            if (node.onDeselected) {
                node.onDeselected();
            }
            node.is_selected = false;
			if (this.onNodeDeselected) {
				this.onNodeDeselected(node);
			}
        }
        this.selected_nodes = {};
        this.current_node = null;
        this.highlighted_links = {};
		if(	this.onSelectionChange )
			this.onSelectionChange( this.selected_nodes );
        this.setDirty(true);
    };

    /**
     * deletes all nodes in the current selection from the graph
     * @method deleteSelectedNodes
     **/
    LGraphCanvas.prototype.deleteSelectedNodes = function() {

		this.graph.beforeChange();

        for (var i in this.selected_nodes) {
            var node = this.selected_nodes[i];

			if(node.block_delete)
				continue;
            this.graph.remove(node);
			if (this.onNodeDeselected) {
				this.onNodeDeselected(node);
			}
        }
        this.selected_nodes = {};
        this.current_node = null;
        this.highlighted_links = {};
        this.setDirty(true);
		this.graph.afterChange();
    };

    /**
     * centers the camera on a given node
     * @method centerOnNode
     **/
    LGraphCanvas.prototype.centerOnNode = function(node) {
        this.ds.offset[0] =
            -node.pos[0] -
            node.size[0] * 0.5 +
            (this.canvas.width * 0.5) / this.ds.scale;
        this.ds.offset[1] =
            -node.pos[1] -
            node.size[1] * 0.5 +
            (this.canvas.height * 0.5) / this.ds.scale;
        this.setDirty(true, true);
    };

    /**
     * adds some useful properties to a mouse event, like the position in graph coordinates
     * @method adjustMouseEvent
     **/
    LGraphCanvas.prototype.adjustMouseEvent = function(e) {
	    var clientX_rel = 0;
        var clientY_rel = 0;

    	if (this.canvas) {
            var b = this.canvas.getBoundingClientRect();
            clientX_rel = e.clientX - b.left;
            clientY_rel = e.clientY - b.top;
        } else {
        	clientX_rel = e.clientX;
        	clientY_rel = e.clientY;
        }

        e.deltaX = clientX_rel - this.last_mouse_position[0];
        e.deltaY = clientY_rel- this.last_mouse_position[1];

        this.last_mouse_position[0] = clientX_rel;
        this.last_mouse_position[1] = clientY_rel;

        e.canvasX = clientX_rel / this.ds.scale - this.ds.offset[0];
        e.canvasY = clientY_rel / this.ds.scale - this.ds.offset[1];

        //console.log("pointerevents: adjustMouseEvent "+e.clientX+":"+e.clientY+" "+clientX_rel+":"+clientY_rel+" "+e.canvasX+":"+e.canvasY);
    };

    /**
     * changes the zoom level of the graph (default is 1), you can pass also a place used to pivot the zoom
     * @method setZoom
     **/
    LGraphCanvas.prototype.setZoom = function(value, zooming_center) {
        this.ds.changeScale(value, zooming_center);
        this.dirty_canvas = true;
        this.dirty_bgcanvas = true;
    };

    /**
     * converts a coordinate from graph coordinates to canvas2D coordinates
     * @method convertOffsetToCanvas
     **/
    LGraphCanvas.prototype.convertOffsetToCanvas = function(pos, out) {
        return this.ds.convertOffsetToCanvas(pos, out);
    };

    /**
     * converts a coordinate from Canvas2D coordinates to graph space
     * @method convertCanvasToOffset
     **/
    LGraphCanvas.prototype.convertCanvasToOffset = function(pos, out) {
        return this.ds.convertCanvasToOffset(pos, out);
    };

    //converts event coordinates from canvas2D to graph coordinates
    LGraphCanvas.prototype.convertEventToCanvasOffset = function(e) {
        var rect = this.canvas.getBoundingClientRect();
        return this.convertCanvasToOffset([
            e.clientX - rect.left,
            e.clientY - rect.top
        ]);
    };

    /**
     * brings a node to front (above all other nodes)
     * @method bringToFront
     **/
    LGraphCanvas.prototype.bringToFront = function(node) {
        var i = this.graph._nodes.indexOf(node);
        if (i == -1) {
            return;
        }

        this.graph._nodes.splice(i, 1);
        this.graph._nodes.push(node);
    };

    /**
     * sends a node to the back (below all other nodes)
     * @method sendToBack
     **/
    LGraphCanvas.prototype.sendToBack = function(node) {
        var i = this.graph._nodes.indexOf(node);
        if (i == -1) {
            return;
        }

        this.graph._nodes.splice(i, 1);
        this.graph._nodes.unshift(node);
    };

    /* Interaction */

    /* LGraphCanvas render */
    var temp = new Float32Array(4);

    /**
     * checks which nodes are visible (inside the camera area)
     * @method computeVisibleNodes
     **/
    LGraphCanvas.prototype.computeVisibleNodes = function(nodes, out) {
        var visible_nodes = out || [];
        visible_nodes.length = 0;
        nodes = nodes || this.graph._nodes;
        for (var i = 0, l = nodes.length; i < l; ++i) {
            var n = nodes[i];

            //skip rendering nodes in live mode
            if (this.live_mode && !n.onDrawBackground && !n.onDrawForeground) {
                continue;
            }

            if (!overlapBounding(this.visible_area, n.getBounding(temp))) {
                continue;
            } //out of the visible area

            visible_nodes.push(n);
        }
        return visible_nodes;
    };

    /**
     * renders the whole canvas content, by rendering in two separated canvas, one containing the background grid and the connections, and one containing the nodes)
     * @method draw
     **/
    LGraphCanvas.prototype.draw = function(force_canvas, force_bgcanvas) {
        if (!this.canvas || this.canvas.width == 0 || this.canvas.height == 0) {
            return;
        }

        //fps counting
        var now = LiteGraph.getTime();
        this.render_time = (now - this.last_draw_time) * 0.001;
        this.last_draw_time = now;

        if (this.graph) {
            this.ds.computeVisibleArea(this.viewport);
        }

        if (
            this.dirty_bgcanvas ||
            force_bgcanvas ||
            this.always_render_background ||
            (this.graph &&
                this.graph._last_trigger_time &&
                now - this.graph._last_trigger_time < 1000)
        ) {
            this.drawBackCanvas();
        }

        if (this.dirty_canvas || force_canvas) {
            this.drawFrontCanvas();
        }

        this.fps = this.render_time ? 1.0 / this.render_time : 0;
        this.frame += 1;
    };

    /**
     * draws the front canvas (the one containing all the nodes)
     * @method drawFrontCanvas
     **/
    LGraphCanvas.prototype.drawFrontCanvas = function() {
        this.dirty_canvas = false;

        if (!this.ctx) {
            this.ctx = this.bgcanvas.getContext("2d");
        }
        var ctx = this.ctx;
        if (!ctx) {
            //maybe is using webgl...
            return;
        }

        var canvas = this.canvas;
        if ( ctx.start2D && !this.viewport ) {
            ctx.start2D();
			ctx.restore();
			ctx.setTransform(1, 0, 0, 1, 0, 0);
        }

        //clip dirty area if there is one, otherwise work in full canvas
		var area = this.viewport || this.dirty_area;
        if (area) {
            ctx.save();
            ctx.beginPath();
            ctx.rect( area[0],area[1],area[2],area[3] );
            ctx.clip();
        }

        //clear
        //canvas.width = canvas.width;
        if (this.clear_background) {
			if(area)
	            ctx.clearRect( area[0],area[1],area[2],area[3] );
			else
	            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        //draw bg canvas
        if (this.bgcanvas == this.canvas) {
            this.drawBackCanvas();
        } else {
            ctx.drawImage( this.bgcanvas, 0, 0 );
        }

        //rendering
        if (this.onRender) {
            this.onRender(canvas, ctx);
        }

        //info widget
        if (this.show_info) {
            this.renderInfo(ctx, area ? area[0] : 0, area ? area[1] : 0 );
        }

        if (this.graph) {
            //apply transformations
            ctx.save();
            this.ds.toCanvasContext(ctx);

            //draw nodes
            var drawn_nodes = 0;
            var visible_nodes = this.computeVisibleNodes(
                null,
                this.visible_nodes
            );

            for (var i = 0; i < visible_nodes.length; ++i) {
                var node = visible_nodes[i];

                //transform coords system
                ctx.save();
                ctx.translate(node.pos[0], node.pos[1]);

                //Draw
                this.drawNode(node, ctx);
                drawn_nodes += 1;

                //Restore
                ctx.restore();
            }

            //on top (debug)
            if (this.render_execution_order) {
                this.drawExecutionOrder(ctx);
            }

            //connections ontop?
            if (this.graph.config.links_ontop) {
                if (!this.live_mode) {
                    this.drawConnections(ctx);
                }
            }

            //current connection (the one being dragged by the mouse)
            if (this.connecting_pos != null) {
                ctx.lineWidth = this.connections_width;
                var link_color = null;

                var connInOrOut = this.connecting_output || this.connecting_input;

                var connType = connInOrOut.type;
                var connDir = connInOrOut.dir;
				if(connDir == null)
				{
					if (this.connecting_output)
						connDir = LiteGraph.RIGHT;
					else
						connDir = LiteGraph.LEFT;
				}
                var connShape = connInOrOut.shape;

                switch (connType) {
                    case LiteGraph.EVENT:
                        link_color = LiteGraph.EVENT_LINK_COLOR;
                        break;
                    default:
                        link_color = LiteGraph.CONNECTING_LINK_COLOR;
                }

                //the connection being dragged by the mouse
                this.renderLink(
                    ctx,
                    this.connecting_pos,
                    [this.graph_mouse[0], this.graph_mouse[1]],
                    null,
                    false,
                    null,
                    link_color,
                    connDir,
                    LiteGraph.CENTER
                );

                ctx.beginPath();
                if (
                    connType === LiteGraph.EVENT ||
                    connShape === LiteGraph.BOX_SHAPE
                ) {
                    ctx.rect(
                        this.connecting_pos[0] - 6 + 0.5,
                        this.connecting_pos[1] - 5 + 0.5,
                        14,
                        10
                    );
	                ctx.fill();
					ctx.beginPath();
                    ctx.rect(
                        this.graph_mouse[0] - 6 + 0.5,
                        this.graph_mouse[1] - 5 + 0.5,
                        14,
                        10
                    );
                } else if (connShape === LiteGraph.ARROW_SHAPE) {
                    ctx.moveTo(this.connecting_pos[0] + 8, this.connecting_pos[1] + 0.5);
                    ctx.lineTo(this.connecting_pos[0] - 4, this.connecting_pos[1] + 6 + 0.5);
                    ctx.lineTo(this.connecting_pos[0] - 4, this.connecting_pos[1] - 6 + 0.5);
                    ctx.closePath();
                }
                else {
                    ctx.arc(
                        this.connecting_pos[0],
                        this.connecting_pos[1],
                        4,
                        0,
                        Math.PI * 2
                    );
	                ctx.fill();
					ctx.beginPath();
                    ctx.arc(
                        this.graph_mouse[0],
                        this.graph_mouse[1],
                        4,
                        0,
                        Math.PI * 2
                    );
                }
                ctx.fill();

                ctx.fillStyle = "#ffcc00";
                if (this._highlight_input) {
                    ctx.beginPath();
                    var shape = this._highlight_input_slot.shape;
                    if (shape === LiteGraph.ARROW_SHAPE) {
                        ctx.moveTo(this._highlight_input[0] + 8, this._highlight_input[1] + 0.5);
                        ctx.lineTo(this._highlight_input[0] - 4, this._highlight_input[1] + 6 + 0.5);
                        ctx.lineTo(this._highlight_input[0] - 4, this._highlight_input[1] - 6 + 0.5);
                        ctx.closePath();
                    } else {
                        ctx.arc(
                            this._highlight_input[0],
                            this._highlight_input[1],
                            6,
                            0,
                            Math.PI * 2
                        );
                    }
                    ctx.fill();
                }
                if (this._highlight_output) {
                    ctx.beginPath();
                    if (shape === LiteGraph.ARROW_SHAPE) {
                        ctx.moveTo(this._highlight_output[0] + 8, this._highlight_output[1] + 0.5);
                        ctx.lineTo(this._highlight_output[0] - 4, this._highlight_output[1] + 6 + 0.5);
                        ctx.lineTo(this._highlight_output[0] - 4, this._highlight_output[1] - 6 + 0.5);
                        ctx.closePath();
                    } else {
                        ctx.arc(
                            this._highlight_output[0],
                            this._highlight_output[1],
                            6,
                            0,
                            Math.PI * 2
                        );
                    }
                    ctx.fill();
                }
            }

			//the selection rectangle
            if (this.dragging_rectangle) {
                ctx.strokeStyle = "#FFF";
                ctx.strokeRect(
                    this.dragging_rectangle[0],
                    this.dragging_rectangle[1],
                    this.dragging_rectangle[2],
                    this.dragging_rectangle[3]
                );
            }

			//on top of link center
			if(this.over_link_center && this.render_link_tooltip)
				this.drawLinkTooltip( ctx, this.over_link_center );
			else
				if(this.onDrawLinkTooltip) //to remove
					this.onDrawLinkTooltip(ctx,null);

			//custom info
            if (this.onDrawForeground) {
                this.onDrawForeground(ctx, this.visible_rect);
            }

            ctx.restore();

            if (this.displayMinimap) {
                this.drawMinimap();
            }
        }

        this.drawZoomWidget();

		//draws panel in the corner
		if (this._graph_stack && this._graph_stack.length) {
			this.drawFunctionDefinitionPanel( ctx );
		}


        if (this.onDrawOverlay) {
            this.onDrawOverlay(ctx);
        }

        if (area){
            ctx.restore();
        }

        if (ctx.finish2D) {
            //this is a function I use in webgl renderer
            ctx.finish2D();
        }
    };

	/**
	 *
	 * activates or deactivates the minimap
	 * @method toggleMinimap
	 */
	LGraphCanvas.prototype.toggleMinimap = function () {
		if(this.displayMinimap){
			this.displayMinimap = false;
		} else {
			this.displayMinimap = true;
		}
	}

    /**
     * draws the panel in the corner that shows function definition properties
     * @method drawFunctionDefinitionPanel
     **/
    LGraphCanvas.prototype.drawFunctionDefinitionPanel = function (ctx) {
        var subgraph = this.graph;
        var subnode = subgraph._function_definition_node;
        if (!subnode) {
            console.warn("subgraph without subnode");
            return;
        }
        this.drawFunctionDefinitionPanelLeft(subgraph, subnode, ctx)
        this.drawFunctionDefinitionPanelRight(subgraph, subnode, ctx)
    }

    LGraphCanvas.prototype.drawFunctionDefinitionPanelLeft = function (subgraph, subnode, ctx) {
        var num = subnode.inputs ? subnode.inputs.length : 0;
        var w = 200;
        var h = Math.floor(LiteGraph.NODE_SLOT_HEIGHT * 1.6);

        ctx.fillStyle = "#111";
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.roundRect(10, 10, w, (num + 1) * h + 50, [8]);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.fillStyle = "#888";
        ctx.font = "14px Arial";
        ctx.textAlign = "left";
        ctx.fillText("Graph Inputs", 20, 34);
        // var pos = this.mouse;

        if (this.drawButton(w - 20, 20, 20, 20, "X", "#151515")) {
            this.closeFunctionDefinition();
            return;
        }

        var y = 50;
        ctx.font = "14px Arial";
        if (subnode.inputs)
            for (var i = 0; i < subnode.inputs.length; ++i) {
                var input = subnode.inputs[i];
                if (input.not_subgraph_input)
                    continue;

                //input button clicked
                if (this.drawButton(20, y + 2, w - 20, h - 2)) {
                    var type = subnode.constructor.input_node_type || "graph/input";
                    this.graph.beforeChange();
                    var newnode = LiteGraph.createNode(type);
                    if (newnode) {
                        subgraph.add(newnode);
                        this.block_click = false;
                        this.last_click_position = null;
                        this.selectNodes([newnode]);
                        this.node_dragged = newnode;
                        this.dragging_canvas = false;
                        newnode.setProperty("name", input.name);
                        newnode.setProperty("type", input.type);
                        this.node_dragged.pos[0] = this.graph_mouse[0] - 5;
                        this.node_dragged.pos[1] = this.graph_mouse[1] - 5;
                        this.graph.afterChange();
                    }
                    else
                        console.error("graph input node not found:", type);
                }
                ctx.fillStyle = "#9C9";
                ctx.beginPath();
                ctx.arc(w - 16, y + h * 0.5, 5, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillStyle = "#AAA";
                ctx.fillText(input.name, 30, y + h * 0.75);
                // var tw = ctx.measureText(input.name);
                ctx.fillStyle = "#777";
                ctx.fillText(input.type, 130, y + h * 0.75);
                y += h;
            }
        //add + button
        if (this.drawButton(20, y + 2, w - 20, h - 2, "+", "#151515", "#222")) {
            this.showFunctionDefinitionPropertiesDialog(subnode);
        }
    }
    LGraphCanvas.prototype.drawFunctionDefinitionPanelRight = function (subgraph, subnode, ctx) {
        var num = subnode.outputs ? subnode.outputs.length : 0;
        var canvas_w = this.bgcanvas.width
        var w = 200;
        var h = Math.floor(LiteGraph.NODE_SLOT_HEIGHT * 1.6);

        ctx.fillStyle = "#111";
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.roundRect(canvas_w - w - 10, 10, w, (num + 1) * h + 50, [8]);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.fillStyle = "#888";
        ctx.font = "14px Arial";
        ctx.textAlign = "left";
        var title_text = "Graph Outputs"
        var tw = ctx.measureText(title_text).width
        ctx.fillText(title_text, (canvas_w - tw) - 20, 34);
        // var pos = this.mouse;
        if (this.drawButton(canvas_w - w, 20, 20, 20, "X", "#151515")) {
            this.closeFunctionDefinition();
            return;
        }

        var y = 50;
        ctx.font = "14px Arial";
        if (subnode.outputs)
            for (var i = 0; i < subnode.outputs.length; ++i) {
                var output = subnode.outputs[i];
                if (output.not_subgraph_input)
                    continue;

                //output button clicked
                if (this.drawButton(canvas_w - w, y + 2, w - 20, h - 2)) {
                    var type = subnode.constructor.output_node_type || "graph/output";
                    this.graph.beforeChange();
                    var newnode = LiteGraph.createNode(type);
                    if (newnode) {
                        subgraph.add(newnode);
                        this.block_click = false;
                        this.last_click_position = null;
                        this.selectNodes([newnode]);
                        this.node_dragged = newnode;
                        this.dragging_canvas = false;
                        newnode.setProperty("name", output.name);
                        newnode.setProperty("type", output.type);
                        this.node_dragged.pos[0] = this.graph_mouse[0] - 5;
                        this.node_dragged.pos[1] = this.graph_mouse[1] - 5;
                        this.graph.afterChange();
                    }
                    else
                        console.error("graph input node not found:", type);
                }
                ctx.fillStyle = "#9C9";
                ctx.beginPath();
                ctx.arc(canvas_w - w + 16, y + h * 0.5, 5, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillStyle = "#AAA";
                ctx.fillText(output.name, canvas_w - w + 30, y + h * 0.75);
                // var tw = ctx.measureText(input.name);
                ctx.fillStyle = "#777";
                ctx.fillText(output.type, canvas_w - w + 130, y + h * 0.75);
                y += h;
            }
        //add + button
        if (this.drawButton(canvas_w - w, y + 2, w - 20, h - 2, "+", "#151515", "#222")) {
            this.showFunctionDefinitionPropertiesDialogRight(subnode);
        }
    }
	//Draws a button into the canvas overlay and computes if it was clicked using the immediate gui paradigm
	LGraphCanvas.prototype.drawButton = function( x,y,w,h, text, bgcolor, hovercolor, textcolor )
	{
		var ctx = this.ctx;
		bgcolor = bgcolor || LiteGraph.NODE_DEFAULT_COLOR;
		hovercolor = hovercolor || "#555";
		textcolor = textcolor || LiteGraph.NODE_TEXT_COLOR;

        //assume canvas has same scale as window
        var pos = [this.mouse[0]- this.canvas.getBoundingClientRect().left,
                    this.mouse[1] - this.canvas.getBoundingClientRect().top];


        //use y instead of yFix
		var hover = LiteGraph.isInsideRectangle( pos[0], pos[1], x,y,w,h );
        if(hover){
        console.log(pos);
        }
        if(this.last_click_position != null)
		    pos = [this.last_click_position[0]- this.canvas.getBoundingClientRect().left,
            this.last_click_position[1] - this.canvas.getBoundingClientRect().top];
        else
            pos = null;

		var clicked = pos && LiteGraph.isInsideRectangle( pos[0], pos[1], x,y,w,h );
        if(hover){
            console.log("Hovering!");
        }

		ctx.fillStyle = hover ? hovercolor : bgcolor;
		if(clicked){
			ctx.fillStyle = "#AAA";
        }
		ctx.beginPath();
		ctx.roundRect(x,y,w,h,[4] );
		ctx.fill();

		if(text != null)
		{
			if(text.constructor == String)
			{
				ctx.fillStyle = textcolor;
				ctx.textAlign = "center";
				ctx.font = ((h * 0.65)|0) + "px Arial";
				ctx.fillText( text, x + w * 0.5,y + h * 0.75 );
				ctx.textAlign = "left";
			}
		}

		var was_clicked = clicked && !this.block_click;
		if(clicked)
			this.blockClick();
		return was_clicked;
	}

	LGraphCanvas.prototype.isAreaClicked = function( x,y,w,h, hold_click )
	{
		var pos = this.mouse;
		var hover = LiteGraph.isInsideRectangle( pos[0], pos[1], x,y,w,h );
		pos = this.last_click_position;
		var clicked = pos && LiteGraph.isInsideRectangle( pos[0], pos[1], x,y,w,h );
		var was_clicked = clicked && !this.block_click;
		if(clicked && hold_click)
			this.blockClick();
		return was_clicked;
	}

    /**
     * draws some useful stats in the corner of the canvas
     * @method renderInfo
     **/
    LGraphCanvas.prototype.renderInfo = function(ctx, x, y) {
        x = x || 10;
        y = y || this.canvas.height - 80;

        ctx.save();
        ctx.translate(x, y);

        ctx.font = "10px Arial";
        ctx.fillStyle = "#888";
		ctx.textAlign = "left";
        if (this.graph) {
            ctx.fillText( "T: " + this.graph.globaltime.toFixed(2) + "s", 5, 13 * 1 );
            ctx.fillText("I: " + this.graph.iteration, 5, 13 * 2 );
            ctx.fillText("N: " + this.graph._nodes.length + " [" + this.visible_nodes.length + "]", 5, 13 * 3 );
            ctx.fillText("V: " + this.graph._version, 5, 13 * 4);
            ctx.fillText("FPS:" + this.fps.toFixed(2), 5, 13 * 5);
        } else {
            ctx.fillText("No graph selected", 5, 13 * 1);
        }
        ctx.restore();
    };

    /**
     * draws the back canvas (the one containing the background and the connections)
     * @method drawBackCanvas
     **/
    LGraphCanvas.prototype.drawBackCanvas = function() {
        var canvas = this.bgcanvas;
        if (
            canvas.width != this.canvas.width ||
            canvas.height != this.canvas.height
        ) {
            canvas.width = this.canvas.width;
            canvas.height = this.canvas.height;
        }

        if (!this.bgctx) {
            this.bgctx = this.bgcanvas.getContext("2d");
        }
        var ctx = this.bgctx;
        if (ctx.start) {
            ctx.start();
        }

		var viewport = this.viewport || [0,0,ctx.canvas.width,ctx.canvas.height];

        //clear
        if (this.clear_background) {
            ctx.clearRect( viewport[0], viewport[1], viewport[2], viewport[3] );
        }

		//show subgraph stack header
        if (this._graph_stack && this._graph_stack.length) {
            ctx.save();
            var parent_graph = this._graph_stack[this._graph_stack.length - 1];
            var function_definition_node = this.graph._function_definition_node;
            ctx.strokeStyle = function_definition_node.bgcolor;
            ctx.lineWidth = 10;
            ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
            ctx.lineWidth = 1;
            ctx.font = "40px Arial";
            ctx.textAlign = "center";
            ctx.fillStyle = function_definition_node.bgcolor || "#AAA";
            var title = "";
            for (var i = 1; i < this._graph_stack.length; ++i) {
                title +=
                    this._graph_stack[i]._function_definition_node.getTitle() + " >> ";
            }
            ctx.fillText(
                title + function_definition_node.getTitle(),
                canvas.width * 0.5,
                40
            );
            ctx.restore();
        }

        var bg_already_painted = false;
        if (this.onRenderBackground) {
            bg_already_painted = this.onRenderBackground(canvas, ctx);
        }

        //reset in case of error
        if ( !this.viewport )
		{
	        ctx.restore();
		    ctx.setTransform(1, 0, 0, 1, 0, 0);
		}
        this.visible_links.length = 0;

        if (this.graph) {
            //apply transformations
            ctx.save();
            this.ds.toCanvasContext(ctx);

            //render BG
            if (
                this.background_image &&
                this.ds.scale > 0.5 &&
                !bg_already_painted
            ) {
                if (this.zoom_modify_alpha) {
                    ctx.globalAlpha =
                        (1.0 - 0.5 / this.ds.scale) * this.editor_alpha;
                } else {
                    ctx.globalAlpha = this.editor_alpha;
                }
                ctx.imageSmoothingEnabled = ctx.imageSmoothingEnabled = false; // ctx.mozImageSmoothingEnabled =
                if (
                    !this._bg_img ||
                    this._bg_img.name != this.background_image
                ) {
                    this._bg_img = new Image();
                    this._bg_img.name = this.background_image;
                    this._bg_img.src = this.background_image;
                    var that = this;
                    this._bg_img.onload = function() {
                        that.draw(true, true);
                    };
                }

                var pattern = null;
                if (this._pattern == null && this._bg_img.width > 0) {
                    pattern = ctx.createPattern(this._bg_img, "repeat");
                    this._pattern_img = this._bg_img;
                    this._pattern = pattern;
                } else {
                    pattern = this._pattern;
                }
                if (pattern) {
                    ctx.fillStyle = pattern;
                    ctx.fillRect(
                        this.visible_area[0],
                        this.visible_area[1],
                        this.visible_area[2],
                        this.visible_area[3]
                    );
                    ctx.fillStyle = "transparent";
                }

                ctx.globalAlpha = 1.0;
                ctx.imageSmoothingEnabled = ctx.imageSmoothingEnabled = true; //= ctx.mozImageSmoothingEnabled
            }

            //comments
            if (this.graph._comments.length && !this.live_mode) {
                this.drawComments(canvas, ctx);
            }

            if (this.onDrawBackground) {
                this.onDrawBackground(ctx, this.visible_area);
            }
            if (this.onBackgroundRender) {
                //LEGACY
                console.error(
                    "WARNING! onBackgroundRender deprecated, now is named onDrawBackground "
                );
                this.onBackgroundRender = null;
            }

            //DEBUG: show clipping area
            //ctx.fillStyle = "red";
            //ctx.fillRect( this.visible_area[0] + 10, this.visible_area[1] + 10, this.visible_area[2] - 20, this.visible_area[3] - 20);

            //bg
            if (this.render_canvas_border) {
                ctx.strokeStyle = "#235";
                ctx.strokeRect(0, 0, canvas.width, canvas.height);
            }

            if (this.render_connections_shadows) {
                ctx.shadowColor = "#000";
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.shadowBlur = 6;
            } else {
                ctx.shadowColor = "rgba(0,0,0,0)";
            }

            //draw connections
            if (!this.live_mode) {
                this.drawConnections(ctx);
            }

            ctx.shadowColor = "rgba(0,0,0,0)";

            //restore state
            ctx.restore();
        }

        if (ctx.finish) {
            ctx.finish();
        }

        this.dirty_bgcanvas = false;
        this.dirty_canvas = true; //to force to repaint the front canvas with the bgcanvas
    };

    var temp_vec2 = new Float32Array(2);

    /**
     * draws the given node inside the canvas
     * @method drawNode
     **/
    LGraphCanvas.prototype.drawNode = function(node, ctx, lq=false) {
        var glow = false;
        this.current_node = node;

        var color = node.color || node.constructor.color || LiteGraph.NODE_DEFAULT_COLOR;
        var bgcolor = node.bgcolor || node.constructor.bgcolor || LiteGraph.NODE_DEFAULT_BGCOLOR;

        //shadow and glow
        if (node.mouseOver) {
            glow = true;
        }

        var low_quality = this.ds.scale < 0.6 || lq; //zoomed out

        //only render if it forces it to do it
        if (this.live_mode) {
            if (!node.flags.collapsed) {
                ctx.shadowColor = "transparent";
                if (node.onDrawForeground) {
                    node.onDrawForeground(ctx, this, this.canvas);
                }
            }
            return;
        }

        var editor_alpha = this.editor_alpha;
        ctx.globalAlpha = editor_alpha;

        if (this.render_shadows && !low_quality) {
            ctx.shadowColor = LiteGraph.DEFAULT_SHADOW_COLOR;
            ctx.shadowOffsetX = 2 * this.ds.scale;
            ctx.shadowOffsetY = 2 * this.ds.scale;
            ctx.shadowBlur = 3 * this.ds.scale;
        } else {
            ctx.shadowColor = "transparent";
        }

        //custom draw collapsed method (draw after shadows because they are affected)
        if (
            node.flags.collapsed &&
            node.onDrawCollapsed &&
            node.onDrawCollapsed(ctx, this) == true
        ) {
            return;
        }

        //clip if required (mask)
        var shape = node._shape || LiteGraph.BOX_SHAPE;
        var size = temp_vec2;
        temp_vec2.set(node.size);

        if (node.flags.collapsed) {
            ctx.font = this.inner_text_font;
            var title = node.getTitle ? node.getTitle() : node.title;
            if (title != null) {
                node._collapsed_width = Math.min(
                    node.size[0],
                    ctx.measureText(title).width +
                        LiteGraph.NODE_TITLE_HEIGHT * 2
                ); //LiteGraph.NODE_COLLAPSED_WIDTH;
                size[0] = node._collapsed_width;
                size[1] = 0;
            }
        }

        //draw shape
        if (node.has_errors) {
            bgcolor = "red";
        }
        this.drawNodeShape(
            node,
            ctx,
            size,
            color,
            bgcolor,
            node.is_selected,
            node.mouseOver
        );
        ctx.shadowColor = "transparent";

        //draw foreground
        if (node.onDrawForeground) {
            node.onDrawForeground(ctx, this, this.canvas);
        }

        //connection slots
        ctx.textAlign = "left";
        ctx.font = this.inner_text_font;

        var render_text = !low_quality;

        var out_slot = this.connecting_output;
        var in_slot = this.connecting_input;
        ctx.lineWidth = 1;

        var max_y = 0;
        var slot_pos = new Float32Array(2); //to reuse

        //render inputs and outputs
        if (!node.flags.collapsed) {
            //input connection slots
            if (node.inputs) {
                for (var i = 0; i < node.inputs.length; i++) {
                    var slot = node.inputs[i];

                    var slot_type = slot.type;
                    var slot_shape = slot.shape;

                    ctx.globalAlpha = editor_alpha;
                    //change opacity of incompatible slots when dragging a connection
                    if ( this.connecting_output && !LiteGraph.isDataTypeMatch( slot.type , out_slot.type) ) {
                        ctx.globalAlpha = 0.4 * editor_alpha;
                    }

                    ctx.fillStyle =
                        slot.link != null
                            ? slot.color_on ||
                              this.default_connection_color_byType[slot_type] ||
                              this.default_connection_color.input_on
                            : slot.color_off ||
                              this.default_connection_color_byTypeOff[slot_type] ||
                              this.default_connection_color_byType[slot_type] ||
                              this.default_connection_color.input_off;

                    var pos = node.getConnectionPos(true, i, slot_pos);
                    pos[0] -= node.pos[0];
                    pos[1] -= node.pos[1];
                    if (max_y < pos[1] + LiteGraph.NODE_SLOT_HEIGHT * 0.5) {
                        max_y = pos[1] + LiteGraph.NODE_SLOT_HEIGHT * 0.5;
                    }

                    ctx.beginPath();

					if (slot_type == "array"){
                        slot_shape = LiteGraph.GRID_SHAPE; // place in addInput? addOutput instead?
                    }

                    var doStroke = true;

                    if (
                        slot.type === LiteGraph.EVENT ||
                        slot.shape === LiteGraph.BOX_SHAPE
                    ) {
                        ctx.rect(
                            pos[0] - 6 + 0.5,
                            pos[1] - 5 + 0.5,
                            14,
                            10
                        );
                    } else if (slot_shape === LiteGraph.ARROW_SHAPE) {
                        ctx.moveTo(pos[0] + 8, pos[1] + 0.5);
                        ctx.lineTo(pos[0] - 4, pos[1] + 6 + 0.5);
                        ctx.lineTo(pos[0] - 4, pos[1] - 6 + 0.5);
                        ctx.closePath();
                    } else if (slot_shape === LiteGraph.GRID_SHAPE) {
                        ctx.rect(pos[0] - 4, pos[1] - 4, 2, 2);
                        ctx.rect(pos[0] - 1, pos[1] - 4, 2, 2);
                        ctx.rect(pos[0] + 2, pos[1] - 4, 2, 2);
                        ctx.rect(pos[0] - 4, pos[1] - 1, 2, 2);
                        ctx.rect(pos[0] - 1, pos[1] - 1, 2, 2);
                        ctx.rect(pos[0] + 2, pos[1] - 1, 2, 2);
                        ctx.rect(pos[0] - 4, pos[1] + 2, 2, 2);
                        ctx.rect(pos[0] - 1, pos[1] + 2, 2, 2);
                        ctx.rect(pos[0] + 2, pos[1] + 2, 2, 2);
                        doStroke = false;
                    } else {
						if(low_quality)
	                        ctx.rect(pos[0] - 4, pos[1] - 4, 8, 8 ); //faster
						else
	                        ctx.arc(pos[0], pos[1], 4, 0, Math.PI * 2);
                    }
                    ctx.fill();

                    //render name
                    if (render_text && i!=node.inputs.length-1) {
                        var text = slot.label != null ? slot.label : slot.name;
                        if (text) {
                            ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;
                            if (slot.dir == LiteGraph.UP) {
                                ctx.fillText(text, pos[0], pos[1] - 10);
                            } else {
                                ctx.fillText(text, pos[0] + 10, pos[1] + 5);
                            }
                        }
                    }
                }
            }

            //output connection slots

            ctx.textAlign = "right";
            ctx.strokeStyle = "black";
            if (node.outputs) {
                for (var i = 0; i < node.outputs.length; i++) {
                    var slot = node.outputs[i];

                    var slot_type = slot.type;
                    var slot_shape = slot.shape;

                    //change opacity of incompatible slots when dragging a connection
                    if (this.connecting_input && !LiteGraph.isDataTypeMatch( slot_type , in_slot.type) ) {
                        ctx.globalAlpha = 0.4 * editor_alpha;
                    }

                    var pos = node.getConnectionPos(false, i, slot_pos);
                    pos[0] -= node.pos[0];
                    pos[1] -= node.pos[1];
                    if (max_y < pos[1] + LiteGraph.NODE_SLOT_HEIGHT * 0.5) {
                        max_y = pos[1] + LiteGraph.NODE_SLOT_HEIGHT * 0.5;
                    }

                    ctx.fillStyle =
                        slot.links && slot.links.length
                            ? slot.color_on ||
                              this.default_connection_color_byType[slot_type] ||
                              this.default_connection_color.output_on
                            : slot.color_off ||
                              this.default_connection_color_byTypeOff[slot_type] ||
                              this.default_connection_color_byType[slot_type] ||
                              this.default_connection_color.output_off;
                    ctx.beginPath();
                    //ctx.rect( node.size[0] - 14,i*14,10,10);

					if (slot_type == "array"){
                        slot_shape = LiteGraph.GRID_SHAPE;
                    }

                    var doStroke = true;

                    if (
                        slot_type === LiteGraph.EVENT ||
                        slot_shape === LiteGraph.BOX_SHAPE
                    ) {
                        ctx.rect(
                            pos[0] - 6 + 0.5,
                            pos[1] - 5 + 0.5,
                            14,
                            10
                        );

                    } else if (slot_shape === LiteGraph.ARROW_SHAPE) {
                        ctx.moveTo(pos[0] + 8, pos[1] + 0.5);
                        ctx.lineTo(pos[0] - 4, pos[1] + 6 + 0.5);
                        ctx.lineTo(pos[0] - 4, pos[1] - 6 + 0.5);
                        ctx.closePath();
                    }  else if (slot_shape === LiteGraph.GRID_SHAPE) {
                        ctx.rect(pos[0] - 4, pos[1] - 4, 2, 2);
                        ctx.rect(pos[0] - 1, pos[1] - 4, 2, 2);
                        ctx.rect(pos[0] + 2, pos[1] - 4, 2, 2);
                        ctx.rect(pos[0] - 4, pos[1] - 1, 2, 2);
                        ctx.rect(pos[0] - 1, pos[1] - 1, 2, 2);
                        ctx.rect(pos[0] + 2, pos[1] - 1, 2, 2);
                        ctx.rect(pos[0] - 4, pos[1] + 2, 2, 2);
                        ctx.rect(pos[0] - 1, pos[1] + 2, 2, 2);
                        ctx.rect(pos[0] + 2, pos[1] + 2, 2, 2);
                        doStroke = false;
                    } else {
						if(low_quality)
	                        ctx.rect(pos[0] - 4, pos[1] - 4, 8, 8 );
						else
	                        ctx.arc(pos[0], pos[1], 4, 0, Math.PI * 2);
                    }

                    //trigger
                    //if(slot.node_id != null && slot.slot == -1)
                    //	ctx.fillStyle = "#F85";

                    //if(slot.links != null && slot.links.length)
                    ctx.fill();
					if(!low_quality && doStroke)
	                    ctx.stroke();

                    //render output name
                    if (render_text && i!=node.outputs.length-1) {
                        var text = slot.label != null ? slot.label : slot.name;
                        if (text) {
                            ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;
                            if (slot.dir == LiteGraph.DOWN) {
                                ctx.fillText(text, pos[0], pos[1] - 8);
                            } else {
                                ctx.fillText(text, pos[0] - 10, pos[1] + 5);
                            }
                        }
                    }
                }
            }

            ctx.textAlign = "left";
            ctx.globalAlpha = 1;

            if (node.widgets) {
				var widgets_y = max_y;
                if (node.widgets_up) {
                    widgets_y = 2;
                }
				if( node.widgets_start_y != null )
                    widgets_y = node.widgets_start_y;
                this.drawNodeWidgets(
                    node,
                    widgets_y,
                    ctx,
                    this.node_widget && this.node_widget[0] == node
                        ? this.node_widget[1]
                        : null
                );
            }
        } else if (this.render_collapsed_slots) {
            //if collapsed
            var input_slot = null;
            var output_slot = null;

            //get first connected slot to render
            if (node.inputs) {
                for (var i = 0; i < node.inputs.length; i++) {
                    var slot = node.inputs[i];
                    if (slot.link == null) {
                        continue;
                    }
                    input_slot = slot;
                    break;
                }
            }
            if (node.outputs) {
                for (var i = 0; i < node.outputs.length; i++) {
                    var slot = node.outputs[i];
                    if (!slot.links || !slot.links.length) {
                        continue;
                    }
                    output_slot = slot;
                }
            }

            if (input_slot) {
                var x = 0;
                var y = LiteGraph.NODE_TITLE_HEIGHT * -0.5; //center
                ctx.fillStyle = "#686";
                ctx.beginPath();
                if (
                    slot.type === LiteGraph.EVENT ||
                    slot.shape === LiteGraph.BOX_SHAPE
                ) {
                    ctx.rect(x - 7 + 0.5, y - 4, 14, 8);
                } else if (slot.shape === LiteGraph.ARROW_SHAPE) {
                    ctx.moveTo(x + 8, y);
                    ctx.lineTo(x + -4, y - 4);
                    ctx.lineTo(x + -4, y + 4);
                    ctx.closePath();
                } else {
                    ctx.arc(x, y, 4, 0, Math.PI * 2);
                }
                ctx.fill();
            }

            if (output_slot) {
                var x = node._collapsed_width;
                var y = LiteGraph.NODE_TITLE_HEIGHT * -0.5; //center
                ctx.fillStyle = "#686";
                ctx.strokeStyle = "black";
                ctx.beginPath();
                if (
                    slot.type === LiteGraph.EVENT ||
                    slot.shape === LiteGraph.BOX_SHAPE
                ) {
                    ctx.rect(x - 7 + 0.5, y - 4, 14, 8);
                } else if (slot.shape === LiteGraph.ARROW_SHAPE) {
                    ctx.moveTo(x + 6, y);
                    ctx.lineTo(x - 6, y - 4);
                    ctx.lineTo(x - 6, y + 4);
                    ctx.closePath();
                } else {
                    ctx.arc(x, y, 4, 0, Math.PI * 2);
                }
                ctx.fill();
                //ctx.stroke();
            }
        }

        ctx.globalAlpha = 1.0;
    };


    //minimap static properties
    LGraphCanvas.minimap = {

        margins: [0.75, 0.0, 0.0, 0.75],
        bgColor0: 'rgba(175,175,175,1.0)',
        bgColor1:'rgba(155,155,155,0.6)',
        overlayColor: 'rgba(0.0,0.0,0.0,0.4)'
    }

    LGraphCanvas.zoom_widget = {
        start: {x: 20, y: 20},
        button_width: 30,
        button_height: 20,
        spacing: 10,
        reset_width: 80,
    }

    LGraphCanvas.prototype.drawZoomWidget = function() {

        var ctx = this.ctx;

        var viewport =
            this.viewport || [0, 0, ctx.canvas.width, ctx.canvas.height];

        let zwidget = LGraphCanvas.zoom_widget;


        zwidget.start.x = ctx.canvas.width - 3.0*zwidget.button_width - 4.0*zwidget.spacing - zwidget.reset_width;
        zwidget.start.y = ctx.canvas.height - zwidget.button_height - zwidget.spacing;

        var scale = this.ds.scale;
        if(this.drawButton(
            zwidget.start.x,
            zwidget.start.y,
            zwidget.button_width,
            zwidget.button_height,
            "-",
            "#151515"))
        {
            scale *= 1.0/1.1;
            this.ds.changeScale(scale, [viewport[0] + 0.5*viewport[2], viewport[1] + 0.5*viewport[3]]);
        }
        if(this.drawButton(
            zwidget.start.x + zwidget.button_width +zwidget.spacing,
            zwidget.start.y,
            zwidget.reset_width,
            zwidget.button_height,
             "reset (" + String(Math.round((scale*100))).padStart(3,' ') + " %)",
             "#151515"))
        {

            this.ds.scale = 1.0;
            let center = [0.0,0.0];
            var visible_nodes = this.graph._nodes;
            for (var i = 0; i < visible_nodes.length; ++i) {
                let node = visible_nodes[i];
                //TODO: account for node height?
                center[0] += (node.pos[0] + node.size[0]*0.5)/visible_nodes.length;
                center[1] += (node.pos[1] + node.size[1]*0.5)/visible_nodes.length;
            }

            this.ds.offset[0] =  ((this.canvas.width * 0.5) / this.ds.scale) - center[0];
            this.ds.offset[1] =  ((this.canvas.height* 0.5) / this.ds.scale) - center[1];
        }
        if(this.drawButton(
            zwidget.start.x + zwidget.button_width + zwidget.reset_width +2.0*zwidget.spacing,
            zwidget.start.y,
            zwidget.button_width,
            zwidget.button_height,
             "+", "#151515"))

        {
            scale *= 1.1;
            this.ds.changeScale(scale, [viewport[0] + 0.5*viewport[2], viewport[1] + 0.5*viewport[3]]);
        }

        if(this.drawButton(
            zwidget.start.x + 2.0*zwidget.button_width + zwidget.reset_width +3.0*zwidget.spacing,
            zwidget.start.y,
            zwidget.button_width,
            zwidget.button_height,
             "FS", "#151515"))

        {
            if(this.fullscreen){
                this.canvas.style.left = "";
                this.canvas.style.top = "";
                this.canvas.style.position="";
                this.canvas.style.zIndex = "";
                this.fullscreen = false;
                this.resize();

            } else {
                this.fullscreen = true;
                this.canvas.style.left = 0;
                this.canvas.style.top = 0;
                this.canvas.style.position = "fixed";
                this.canvas.style.zIndex = 100;
                this.resize();
            }
        }
    }

    /**
     * draws the minimap
     * @method drawMinimap
     */
    LGraphCanvas.prototype.drawMinimap = function(){
        var ctx = this.ctx;
        ctx.save();

        var viewport =
            this.viewport || [0, 0, ctx.canvas.width, ctx.canvas.height];
        // TODO: clip path and get correct transform
        let vwidth = viewport[2] - viewport[0];
        let vheight = viewport[3] - viewport[1];

        let minimap = LGraphCanvas.minimap;
        let minimap_margins = minimap.margins;

        let minimap_vp = [
            viewport[0] + vwidth * minimap_margins[0],
            viewport[1] + vheight * minimap_margins[1],
            vwidth * (-minimap_margins[0] - minimap_margins[2] + 1.0),
            vheight * (-minimap_margins[1] - minimap_margins[3] + 1.0)
        ];


        ctx.beginPath();
        ctx.rect(
            viewport[0] + vwidth * minimap_margins[0],
            viewport[1] + vheight * minimap_margins[1],
            vwidth * (-minimap_margins[0] - minimap_margins[2] + 1.0),
            vheight * (-minimap_margins[1] - minimap_margins[3] + 1.0));
        //fill the background with a solid color
        ctx.fillStyle = minimap.bgColor0;

        ctx.clip();

        ctx.fill();
        ctx.closePath();

        // scale the minimap
        // TODO: account for node header
        let bbox = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
        var visible_nodes = this.graph._nodes;
        for (var i = 0; i < visible_nodes.length; ++i) {
            let node = visible_nodes[i];
            bbox[0] = Math.min(bbox[0], node.pos[0]);
            bbox[1] = Math.min(bbox[1], node.pos[1]);
            bbox[2] = Math.max(bbox[2], node.pos[0] + node.size[0]);
            bbox[3] = Math.max(bbox[3], node.pos[1] + node.size[1]);
        }


        bbox[0] = Math.min(bbox[0], -this.ds.offset[0]);
        bbox[1] = Math.min(bbox[1], -this.ds.offset[1]);
        bbox[2] = Math.max(bbox[2], -this.ds.offset[0]+vwidth/this.ds.scale);
        bbox[3] = Math.max(bbox[3], -this.ds.offset[1]+vheight/this.ds.scale);
        // enlarge the box by 10%
        bbox[0] = bbox[0] - (bbox[2] - bbox[0]) * 0.05;
        bbox[1] = bbox[1] - (bbox[3] - bbox[1]) * 0.05;
        bbox[2] = bbox[2] + (bbox[2] - bbox[0]) * 0.05;
        bbox[3] = bbox[3] + (bbox[3] - bbox[1]) * 0.05;
        if(this.frozen_view){
            //make sure the minimap view does not change
            bbox[0] = this.frozen_view[0];
            bbox[1] = this.frozen_view[1];
            bbox[2] = this.frozen_view[2];
            bbox[3] = this.frozen_view[3];
        }

        // we match the width or height depending on ratios
        let bbox_ratio = (bbox[2] - bbox[0]) / (bbox[3] - bbox[1]);
        let minimap_ratio = minimap_vp[2] / minimap_vp[3];
        let scale = 1.0;
        if (minimap_ratio < bbox_ratio) {
            scale = (bbox[2] - bbox[0]) / minimap_vp[2];
        } else {
            scale = (bbox[3] - bbox[1]) / minimap_vp[3];
        }
        let translation = [minimap_vp[0] * scale + (minimap_vp[2] * scale * 0.5) -
                            (bbox[0] + bbox[2]) * 0.5,
                            minimap_vp[1] * scale + (minimap_vp[3] * scale * 0.5) -
                            (bbox[1] + bbox[3]) * 0.5]
        ctx.scale(1.0 / scale, 1.0 / scale);
        ctx.translate(translation[0],translation[1]);

        // draw nodes
        var drawn_nodes = 0;

        //always draw conenctions
        this.drawConnections(ctx, true);


        for (var i = 0; i < visible_nodes.length; ++i) {
            var node = visible_nodes[i];

            // transform coords system
            ctx.save();
            ctx.translate(node.pos[0], node.pos[1]);

            // Draw
            this.drawNode(node, ctx, true /*low quality*/);
            drawn_nodes += 1;

            // Restore
            ctx.restore();
        }

        if(this.frozen_view){

            //set viewport
            var mpos = [this.mouse[0]- this.canvas.getBoundingClientRect().left,
                        this.mouse[1] - this.canvas.getBoundingClientRect().top];
            mpos[0] = mpos[0]*scale;
            mpos[1] = mpos[1]*scale;
            mpos[0] = mpos[0] - translation[0];
            mpos[1] = mpos[1] - translation[1];



            this.ds.offset[0] = -mpos[0] +0.5*vwidth/this.ds.scale;;
            this.ds.offset[1] = -mpos[1] +0.5*vheight/this.ds.scale;;
        }

        ctx.beginPath();
        ctx.rect(
            -this.ds.offset[0],
            -this.ds.offset[1],
            vwidth/this.ds.scale,
            vheight/this.ds.scale);

        ctx.fillStyle=minimap.overlayColor;
        ctx.fill()
        ctx.closePath();
        ctx.restore();

        //handle input
        var pos
        if(this.last_click_position != null){
		    pos = [this.last_click_position[0]- this.canvas.getBoundingClientRect().left,
            this.last_click_position[1] - this.canvas.getBoundingClientRect().top];
        } else {
            pos = null;
        }

        var clicked = pos && LiteGraph.isInsideRectangle( pos[0], pos[1],
                                                        minimap_vp[0],minimap_vp[1],
                                                        minimap_vp[2],minimap_vp[3] );

        var was_clicked = clicked && !this.block_click;
        if(was_clicked){
            this.blockClick();
            this.frozen_view = [bbox[0],bbox[1],bbox[2],bbox[3]];

        }

    }

	//used by this.over_link_center
	LGraphCanvas.prototype.drawLinkTooltip = function( ctx, link )
	{
		var pos = link._pos;
		ctx.fillStyle = "black";
		ctx.beginPath();
		ctx.arc( pos[0], pos[1], 3, 0, Math.PI * 2 );
		ctx.fill();

		if(link.data == null)
			return;

		if(this.onDrawLinkTooltip)
			if( this.onDrawLinkTooltip(ctx,link,this) == true )
				return;

		var data = link.data;
		var text = null;

		if( data.constructor === Number )
			text = data.toFixed(2);
		else if( data.constructor === String )
			text = "\"" + data + "\"";
		else if( data.constructor === Boolean )
			text = String(data);
		else if (data.toToolTip)
			text = data.toToolTip();
		else
			text = "[" + data.constructor.name + "]";

		if(text == null)
			return;
		text = text.substr(0,30); //avoid weird

		ctx.font = "14px Courier New";
		var info = ctx.measureText(text);
		var w = info.width + 20;
		var h = 24;
		ctx.shadowColor = "black";
		ctx.shadowOffsetX = 2;
		ctx.shadowOffsetY = 2;
		ctx.shadowBlur = 3;
		ctx.fillStyle = "#454";
		ctx.beginPath();
		ctx.roundRect( pos[0] - w*0.5, pos[1] - 15 - h, w, h, [3]);
		ctx.moveTo( pos[0] - 10, pos[1] - 15 );
		ctx.lineTo( pos[0] + 10, pos[1] - 15 );
		ctx.lineTo( pos[0], pos[1] - 5 );
		ctx.fill();
        ctx.shadowColor = "transparent";
		ctx.textAlign = "center";
		ctx.fillStyle = "#CEC";
		ctx.fillText(text, pos[0], pos[1] - 15 - h * 0.3);
	}

    /**
     * draws the shape of the given node in the canvas
     * @method drawNodeShape
     **/
    var tmp_area = new Float32Array(4);

    LGraphCanvas.prototype.drawNodeShape = function(
        node,
        ctx,
        size,
        fgcolor,
        bgcolor,
        selected,
        mouse_over
    ) {
        //bg rect
        ctx.strokeStyle = fgcolor;
        ctx.fillStyle = bgcolor;

        var title_height = LiteGraph.NODE_TITLE_HEIGHT;
        var low_quality = this.ds.scale < 0.5;

        //render node area depending on shape
        var shape =
            node._shape || node.constructor.shape || LiteGraph.ROUND_SHAPE;

        var title_mode = node.constructor.title_mode;

        var render_title = true;
        if (title_mode == LiteGraph.TRANSPARENT_TITLE || title_mode == LiteGraph.NO_TITLE) {
            render_title = false;
        } else if (title_mode == LiteGraph.AUTOHIDE_TITLE && mouse_over) {
            render_title = true;
        }

        var area = tmp_area;
        area[0] = 0; //x
        area[1] = render_title ? -title_height : 0; //y
        area[2] = size[0] + 1; //w
        area[3] = render_title ? size[1] + title_height : size[1]; //h

        var old_alpha = ctx.globalAlpha;

        //full node shape
        //if(node.flags.collapsed)
        {
            ctx.beginPath();
            if (shape == LiteGraph.BOX_SHAPE || low_quality) {
                ctx.fillRect(area[0], area[1], area[2], area[3]);
            } else if (
                shape == LiteGraph.ROUND_SHAPE ||
                shape == LiteGraph.CARD_SHAPE
            ) {
                ctx.roundRect(
                    area[0],
                    area[1],
                    area[2],
                    area[3],
                    shape == LiteGraph.CARD_SHAPE ? [this.round_radius,this.round_radius,0,0] : [this.round_radius]
                );
            } else if (shape == LiteGraph.CIRCLE_SHAPE) {
                ctx.arc(
                    size[0] * 0.5,
                    size[1] * 0.5,
                    size[0] * 0.5,
                    0,
                    Math.PI * 2
                );
            }
            ctx.fill();

			//separator
			if(!node.flags.collapsed && render_title)
			{
				ctx.shadowColor = "transparent";
				ctx.fillStyle = "rgba(0,0,0,0.2)";
				ctx.fillRect(0, -1, area[2], 2);
			}
        }
        ctx.shadowColor = "transparent";

        if (node.onDrawBackground) {
            node.onDrawBackground(ctx, this, this.canvas, this.graph_mouse );
        }

        //title bg (remember, it is rendered ABOVE the node)
        if (render_title || title_mode == LiteGraph.TRANSPARENT_TITLE) {
            //title bar
            if (node.onDrawTitleBar) {
                node.onDrawTitleBar( ctx, title_height, size, this.ds.scale, fgcolor );
            } else if (
                title_mode != LiteGraph.TRANSPARENT_TITLE &&
                (node.constructor.title_color || this.render_title_colored)
            ) {
                var title_color = node.constructor.title_color || fgcolor;

                if (node.flags.collapsed) {
                    ctx.shadowColor = LiteGraph.DEFAULT_SHADOW_COLOR;
                }

                //* gradient test
                if (this.use_gradients) {
                    var grad = LGraphCanvas.gradients[title_color];
                    if (!grad) {
                        grad = LGraphCanvas.gradients[ title_color ] = ctx.createLinearGradient(0, 0, 400, 0);
                        grad.addColorStop(0, title_color); // TODO refactor: validate color !! prevent DOMException
                        grad.addColorStop(1, "#000");
                    }
                    ctx.fillStyle = grad;
                } else {
                    ctx.fillStyle = title_color;
                }

                //ctx.globalAlpha = 0.5 * old_alpha;
                ctx.beginPath();
                if (shape == LiteGraph.BOX_SHAPE || low_quality) {
                    ctx.rect(0, -title_height, size[0] + 1, title_height);
                } else if (  shape == LiteGraph.ROUND_SHAPE || shape == LiteGraph.CARD_SHAPE ) {
                    ctx.roundRect(
                        0,
                        -title_height,
                        size[0] + 1,
                        title_height,
                        node.flags.collapsed ? [this.round_radius] : [this.round_radius,this.round_radius,0,0]
                    );
                }
                ctx.fill();
                ctx.shadowColor = "transparent";
            }

            var colState = false;
            if (LiteGraph.node_box_coloured_by_mode){
                if(LiteGraph.NODE_MODES_COLORS[node.mode]){
                    colState = LiteGraph.NODE_MODES_COLORS[node.mode];
                }
            }
            if (LiteGraph.node_box_coloured_when_on){
                colState = node.action_triggered ? "#FFF" : (node.execute_triggered ? "#AAA" : colState);
            }

            //title box
            var box_size = 10;
            if (node.onDrawTitleBox) {
                node.onDrawTitleBox(ctx, title_height, size, this.ds.scale);
            } else if (
                shape == LiteGraph.ROUND_SHAPE ||
                shape == LiteGraph.CIRCLE_SHAPE ||
                shape == LiteGraph.CARD_SHAPE
            ) {
                if (low_quality) {
                    ctx.fillStyle = "black";
                    ctx.beginPath();
                    ctx.arc(
                        title_height * 0.5,
                        title_height * -0.5,
                        box_size * 0.5 + 1,
                        0,
                        Math.PI * 2
                    );
                    ctx.fill();
                }

                ctx.fillStyle = node.boxcolor || colState || LiteGraph.NODE_DEFAULT_BOXCOLOR;

            } else {
                if (low_quality) {
                    ctx.fillStyle = "black";
                    ctx.fillRect(
                        (title_height - box_size) * 0.5 - 1,
                        (title_height + box_size) * -0.5 - 1,
                        box_size + 2,
                        box_size + 2
                    );
                }
                ctx.fillStyle = node.boxcolor || colState || LiteGraph.NODE_DEFAULT_BOXCOLOR;
                ctx.fillRect(
                    (title_height - box_size) * 0.5,
                    (title_height + box_size) * -0.5,
                    box_size,
                    box_size
                );
            }
            ctx.globalAlpha = old_alpha;

            //title text
            if (node.onDrawTitleText) {
                node.onDrawTitleText(
                    ctx,
                    title_height,
                    size,
                    this.ds.scale,
                    this.title_text_font,
                    selected
                );
            }
            if (!low_quality) {
                ctx.font = this.title_text_font;
                var title = String(node.getTitle());
                if (title) {
                    if (selected) {
                        ctx.fillStyle = LiteGraph.NODE_SELECTED_TITLE_COLOR;
                    } else {
                        ctx.fillStyle =
                            node.constructor.title_text_color ||
                            this.node_title_color;
                    }
                    if (node.flags.collapsed) {
                        ctx.textAlign = "left";
                        var measure = ctx.measureText(title);
                        ctx.fillText(
                            title.substr(0,20), //avoid urls too long
                            title_height,// + measure.width * 0.5,
                            LiteGraph.NODE_TITLE_TEXT_Y - title_height
                        );
                        ctx.textAlign = "left";
                    } else {
                        ctx.textAlign = "left";
                        ctx.fillText(
                            title,
                            title_height,
                            LiteGraph.NODE_TITLE_TEXT_Y - title_height
                        );
                    }
                }
            }

			//function definition box
			if (!node.flags.collapsed && node.subgraph && !node.skip_subgraph_button) {
				var w = LiteGraph.NODE_TITLE_HEIGHT;
				var x = node.size[0] - w;
				var over = LiteGraph.isInsideRectangle( this.graph_mouse[0] - node.pos[0], this.graph_mouse[1] - node.pos[1], x+2, -w+2, w-4, w-4 );
				ctx.fillStyle = over ? "#888" : "#555";
				if( shape == LiteGraph.BOX_SHAPE || low_quality)
					ctx.fillRect(x+2, -w+2, w-4, w-4);
				else
				{
					ctx.beginPath();
					ctx.roundRect(x+2, -w+2, w-4, w-4,[4]);
					ctx.fill();
				}
				ctx.fillStyle = "#333";
				ctx.beginPath();
				ctx.moveTo(x + w * 0.2, -w * 0.6);
				ctx.lineTo(x + w * 0.8, -w * 0.6);
				ctx.lineTo(x + w * 0.5, -w * 0.3);
				ctx.fill();
			}

			//custom title render
            if (node.onDrawTitle) {
                node.onDrawTitle(ctx);
            }
        }

        //render selection marker
        if (selected) {
            if (title_mode == LiteGraph.TRANSPARENT_TITLE) {
                area[1] -= title_height;
                area[3] += title_height;
            }
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            if (shape == LiteGraph.BOX_SHAPE) {
                ctx.rect(
                    -6 + area[0],
                    -6 + area[1],
                    12 + area[2],
                    12 + area[3]
                );
            } else if (
                shape == LiteGraph.ROUND_SHAPE ||
                (shape == LiteGraph.CARD_SHAPE && node.flags.collapsed)
            ) {
                ctx.roundRect(
                    -6 + area[0],
                    -6 + area[1],
                    12 + area[2],
                    12 + area[3],
                    [this.round_radius * 2]
                );
            } else if (shape == LiteGraph.CARD_SHAPE) {
                ctx.roundRect(
                    -6 + area[0],
                    -6 + area[1],
                    12 + area[2],
                    12 + area[3],
                    [this.round_radius * 2,2,this.round_radius * 2,2]
                );
            } else if (shape == LiteGraph.CIRCLE_SHAPE) {
                ctx.arc(
                    size[0] * 0.5,
                    size[1] * 0.5,
                    size[0] * 0.5 + 6,
                    0,
                    Math.PI * 2
                );
            }
            ctx.strokeStyle = LiteGraph.NODE_BOX_OUTLINE_COLOR;
            ctx.stroke();
            ctx.strokeStyle = fgcolor;
            ctx.globalAlpha = 1;
        }

        // these counter helps in conditioning drawing based on if the node has been executed or an action occurred
        if (node.execute_triggered>0) node.execute_triggered--;
        if (node.action_triggered>0) node.action_triggered--;
    };

    var margin_area = new Float32Array(4);
    var link_bounding = new Float32Array(4);
    var tempA = new Float32Array(2);
    var tempB = new Float32Array(2);

    /**
     * draws every connection visible in the canvas
     * OPTIMIZE THIS: pre-catch connections position instead of recomputing them every time
     * @method drawConnections
     **/
    LGraphCanvas.prototype.drawConnections = function(ctx, lq = false) {
        var now = LiteGraph.getTime();
        var visible_area = this.visible_area;
        margin_area[0] = visible_area[0] - 20;
        margin_area[1] = visible_area[1] - 20;
        margin_area[2] = visible_area[2] + 40;
        margin_area[3] = visible_area[3] + 40;

        //draw connections
        ctx.lineWidth = this.connections_width;

        ctx.fillStyle = "#AAA";
        ctx.strokeStyle = "#AAA";
        ctx.globalAlpha = this.editor_alpha;
        //for every node
        var nodes = this.graph._nodes;
        for (var n = 0, l = nodes.length; n < l; ++n) {
            var node = nodes[n];
            //for every input (we render just inputs because it is easier as every slot can only have one input)
            if (!node.inputs || !node.inputs.length) {
                continue;
            }

            for (var i = 0; i < node.inputs.length; ++i) {
                var input = node.inputs[i];
                if (!input || input.link == null) {
                    continue;
                }
                var link_id = input.link;
                var link = this.graph.links[link_id];
                if (!link) {
                    continue;
                }

                //find link info
                var start_node = this.graph.getNodeById(link.out_node_id);
                if (start_node == null) {
                    continue;
                }
                var start_node_slot = link.out_slot_name;
                var start_node_slotpos = null;
                if (start_node_slot == -1) {
                    start_node_slotpos = [
                        start_node.pos[0] + 10,
                        start_node.pos[1] + 10
                    ];
                } else {
                    start_node_slotpos = start_node.getConnectionPos(
                        false,
                        start_node_slot,
                        tempA
                    );
                }
                var end_node_slotpos = node.getConnectionPos(true, i, tempB);

                //compute link bounding
                link_bounding[0] = start_node_slotpos[0];
                link_bounding[1] = start_node_slotpos[1];
                link_bounding[2] = end_node_slotpos[0] - start_node_slotpos[0];
                link_bounding[3] = end_node_slotpos[1] - start_node_slotpos[1];
                if (link_bounding[2] < 0) {
                    link_bounding[0] += link_bounding[2];
                    link_bounding[2] = Math.abs(link_bounding[2]);
                }
                if (link_bounding[3] < 0) {
                    link_bounding[1] += link_bounding[3];
                    link_bounding[3] = Math.abs(link_bounding[3]);
                }

                //skip links outside of the visible area of the canvas
				// if lq = true (low quality), render everything
				// TODO: maybe have a "lq" and a "global", or change state and draw the whole viewport?
                if (!overlapBounding(link_bounding, margin_area)  && !lq) {
                    continue;
                }

                var start_slot = start_node.outputs[start_node_slot];
                var end_slot = node.inputs[i];
                if (!start_slot || !end_slot) {
                    continue;
                }
                var start_dir =
                    start_slot.dir || LiteGraph.RIGHT;
                var end_dir =
                    end_slot.dir || LiteGraph.LEFT;

                this.renderLink(
                    ctx,
                    start_node_slotpos,
                    end_node_slotpos,
                    link,
                    false,
                    0,
                    null,
                    start_dir,
                    end_dir,
					null,
                    lq
                );

                //event triggered rendered on top
                if (link && link._last_time && now - link._last_time < 1000) {
                    var f = 2.0 - (now - link._last_time) * 0.002;
                    var tmp = ctx.globalAlpha;
                    ctx.globalAlpha = tmp * f;
                    this.renderLink(
                        ctx,
                        start_node_slotpos,
                        end_node_slotpos,
                        link,
                        true,
                        f,
                        "white",
                        start_dir,
                        end_dir
                    );
                    ctx.globalAlpha = tmp;
                }
            }
        }
        ctx.globalAlpha = 1;
    };

    /**
     * draws a link between two points
     * @method renderLink
     * @param {vec2} a start pos
     * @param {vec2} b end pos
     * @param {Object} link the link object with all the link info
     * @param {boolean} skip_border ignore the shadow of the link
     * @param {boolean} flow show flow animation (for events)
     * @param {string} color the color for the link
     * @param {number} start_dir the direction enum
     * @param {number} end_dir the direction enum
     * @param {number} num_sublines number of sublines (useful to represent vec3 or rgb)
     **/
    LGraphCanvas.prototype.renderLink = function(
        ctx,
        a,
        b,
        link,
        skip_border,
        flow,
        color,
        start_dir,
        end_dir,
        num_sublines,
		lq = false
    ) {
        if (link) {
            this.visible_links.push(link);
        }

        color = this.default_link_color;
        if (link != null && this.highlighted_links[link.id]) {
            color = "#FFF";
        }

        start_dir = start_dir || LiteGraph.RIGHT;
        end_dir = end_dir || LiteGraph.LEFT;

        var dist = distance(a, b);

		//if low quality, never draw border
        if ((this.render_connections_border && this.ds.scale > 0.6 ) && !lq) {
            ctx.lineWidth = this.connections_width + 4;
        }
        ctx.lineJoin = "round";
        num_sublines = num_sublines || 1;
        if (num_sublines > 1) {
            ctx.lineWidth = 0.5;
        }

        //begin line shape
        ctx.beginPath();
        for (var i = 0; i < num_sublines; i += 1) {
            var offsety = (i - (num_sublines - 1) * 0.5) * 5;

            if (this.links_render_mode == LiteGraph.SPLINE_LINK) {
                ctx.moveTo(a[0], a[1] + offsety);
                var start_offset_x = 0;
                var start_offset_y = 0;
                var end_offset_x = 0;
                var end_offset_y = 0;
                switch (start_dir) {
                    case LiteGraph.LEFT:
                        start_offset_x = dist * -0.25;
                        break;
                    case LiteGraph.RIGHT:
                        start_offset_x = dist * 0.25;
                        break;
                    case LiteGraph.UP:
                        start_offset_y = dist * -0.25;
                        break;
                    case LiteGraph.DOWN:
                        start_offset_y = dist * 0.25;
                        break;
                }
                switch (end_dir) {
                    case LiteGraph.LEFT:
                        end_offset_x = dist * -0.25;
                        break;
                    case LiteGraph.RIGHT:
                        end_offset_x = dist * 0.25;
                        break;
                    case LiteGraph.UP:
                        end_offset_y = dist * -0.25;
                        break;
                    case LiteGraph.DOWN:
                        end_offset_y = dist * 0.25;
                        break;
                }
                ctx.bezierCurveTo(
                    a[0] + start_offset_x,
                    a[1] + start_offset_y + offsety,
                    b[0] + end_offset_x,
                    b[1] + end_offset_y + offsety,
                    b[0],
                    b[1] + offsety
                );
            } else if (this.links_render_mode == LiteGraph.LINEAR_LINK) {
                ctx.moveTo(a[0], a[1] + offsety);
                var start_offset_x = 0;
                var start_offset_y = 0;
                var end_offset_x = 0;
                var end_offset_y = 0;
                switch (start_dir) {
                    case LiteGraph.LEFT:
                        start_offset_x = -1;
                        break;
                    case LiteGraph.RIGHT:
                        start_offset_x = 1;
                        break;
                    case LiteGraph.UP:
                        start_offset_y = -1;
                        break;
                    case LiteGraph.DOWN:
                        start_offset_y = 1;
                        break;
                }
                switch (end_dir) {
                    case LiteGraph.LEFT:
                        end_offset_x = -1;
                        break;
                    case LiteGraph.RIGHT:
                        end_offset_x = 1;
                        break;
                    case LiteGraph.UP:
                        end_offset_y = -1;
                        break;
                    case LiteGraph.DOWN:
                        end_offset_y = 1;
                        break;
                }
                var l = 15;
                ctx.lineTo(
                    a[0] + start_offset_x * l,
                    a[1] + start_offset_y * l + offsety
                );
                ctx.lineTo(
                    b[0] + end_offset_x * l,
                    b[1] + end_offset_y * l + offsety
                );
                ctx.lineTo(b[0], b[1] + offsety);
            } else if (this.links_render_mode == LiteGraph.STRAIGHT_LINK) {
                ctx.moveTo(a[0], a[1]);
                var start_x = a[0];
                var start_y = a[1];
                var end_x = b[0];
                var end_y = b[1];
                if (start_dir == LiteGraph.RIGHT) {
                    start_x += 10;
                } else {
                    start_y += 10;
                }
                if (end_dir == LiteGraph.LEFT) {
                    end_x -= 10;
                } else {
                    end_y -= 10;
                }
                ctx.lineTo(start_x, start_y);
                ctx.lineTo((start_x + end_x) * 0.5, start_y);
                ctx.lineTo((start_x + end_x) * 0.5, end_y);
                ctx.lineTo(end_x, end_y);
                ctx.lineTo(b[0], b[1]);
            } else {
                return;
            } //unknown
        }

        //rendering the outline of the connection can be a little bit slow
        if (
            this.render_connections_border &&
            this.ds.scale > 0.6 &&
            !skip_border && !lq
        ) {
            ctx.strokeStyle = "rgba(0,0,0,0.5)";
            ctx.stroke();
        }

        let addWidth = 0;
        if(lq){
            addWidth = addWidth + 10;
        }

        ctx.lineWidth = this.connections_width + addWidth;
        ctx.fillStyle = ctx.strokeStyle = color;
        ctx.stroke();
        //end line shape

        var pos = this.computeConnectionPoint(a, b, 0.5, start_dir, end_dir);
        if (link && link._pos) {
            link._pos[0] = pos[0];
            link._pos[1] = pos[1];
        }

        //render arrow in the middle
        if (
            this.ds.scale >= 0.6 &&
            this.highquality_render &&
            end_dir != LiteGraph.CENTER && !lq
        ) {
            //render arrow
            if (this.render_connection_arrows) {
                //compute two points in the connection
                var posA = this.computeConnectionPoint(
                    a,
                    b,
                    0.25,
                    start_dir,
                    end_dir
                );
                var posB = this.computeConnectionPoint(
                    a,
                    b,
                    0.26,
                    start_dir,
                    end_dir
                );
                var posC = this.computeConnectionPoint(
                    a,
                    b,
                    0.75,
                    start_dir,
                    end_dir
                );
                var posD = this.computeConnectionPoint(
                    a,
                    b,
                    0.76,
                    start_dir,
                    end_dir
                );

                //compute the angle between them so the arrow points in the right direction
                var angleA = 0;
                var angleB = 0;
                if (this.render_curved_connections) {
                    angleA = -Math.atan2(posB[0] - posA[0], posB[1] - posA[1]);
                    angleB = -Math.atan2(posD[0] - posC[0], posD[1] - posC[1]);
                } else {
                    angleB = angleA = b[1] > a[1] ? 0 : Math.PI;
                }

                //render arrow
                ctx.save();
                ctx.translate(posA[0], posA[1]);
                ctx.rotate(angleA);
                ctx.beginPath();
                ctx.moveTo(-5, -3);
                ctx.lineTo(0, +7);
                ctx.lineTo(+5, -3);
                ctx.fill();
                ctx.restore();
                ctx.save();
                ctx.translate(posC[0], posC[1]);
                ctx.rotate(angleB);
                ctx.beginPath();
                ctx.moveTo(-5, -3);
                ctx.lineTo(0, +7);
                ctx.lineTo(+5, -3);
                ctx.fill();
                ctx.restore();
            }

            //circle
            ctx.beginPath();
            ctx.arc(pos[0], pos[1], 5, 0, Math.PI * 2);
            ctx.fill();
        }

        //render flowing points
        if (flow) {
            ctx.fillStyle = color;
            for (var i = 0; i < 5; ++i) {
                var f = (LiteGraph.getTime() * 0.001 + i * 0.2) % 1;
                var pos = this.computeConnectionPoint(
                    a,
                    b,
                    f,
                    start_dir,
                    end_dir
                );
                ctx.beginPath();
                ctx.arc(pos[0], pos[1], 5, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
    };

    //returns the link center point based on curvature
    LGraphCanvas.prototype.computeConnectionPoint = function(
        a,
        b,
        t,
        start_dir,
        end_dir
    ) {
        start_dir = start_dir || LiteGraph.RIGHT;
        end_dir = end_dir || LiteGraph.LEFT;

        var dist = distance(a, b);
        var p0 = a;
        var p1 = [a[0], a[1]];
        var p2 = [b[0], b[1]];
        var p3 = b;

        switch (start_dir) {
            case LiteGraph.LEFT:
                p1[0] += dist * -0.25;
                break;
            case LiteGraph.RIGHT:
                p1[0] += dist * 0.25;
                break;
            case LiteGraph.UP:
                p1[1] += dist * -0.25;
                break;
            case LiteGraph.DOWN:
                p1[1] += dist * 0.25;
                break;
        }
        switch (end_dir) {
            case LiteGraph.LEFT:
                p2[0] += dist * -0.25;
                break;
            case LiteGraph.RIGHT:
                p2[0] += dist * 0.25;
                break;
            case LiteGraph.UP:
                p2[1] += dist * -0.25;
                break;
            case LiteGraph.DOWN:
                p2[1] += dist * 0.25;
                break;
        }

        var c1 = (1 - t) * (1 - t) * (1 - t);
        var c2 = 3 * ((1 - t) * (1 - t)) * t;
        var c3 = 3 * (1 - t) * (t * t);
        var c4 = t * t * t;

        var x = c1 * p0[0] + c2 * p1[0] + c3 * p2[0] + c4 * p3[0];
        var y = c1 * p0[1] + c2 * p1[1] + c3 * p2[1] + c4 * p3[1];
        return [x, y];
    };

    LGraphCanvas.prototype.drawExecutionOrder = function(ctx) {
        ctx.shadowColor = "transparent";
        ctx.globalAlpha = 0.25;

        ctx.textAlign = "center";
        ctx.strokeStyle = "white";
        ctx.globalAlpha = 0.75;

        var visible_nodes = this.visible_nodes;
        for (var i = 0; i < visible_nodes.length; ++i) {
            var node = visible_nodes[i];
            ctx.fillStyle = "black";
            ctx.fillRect(
                node.pos[0] - LiteGraph.NODE_TITLE_HEIGHT,
                node.pos[1] - LiteGraph.NODE_TITLE_HEIGHT,
                LiteGraph.NODE_TITLE_HEIGHT,
                LiteGraph.NODE_TITLE_HEIGHT
            );
            if (node.order == 0) {
                ctx.strokeRect(
                    node.pos[0] - LiteGraph.NODE_TITLE_HEIGHT + 0.5,
                    node.pos[1] - LiteGraph.NODE_TITLE_HEIGHT + 0.5,
                    LiteGraph.NODE_TITLE_HEIGHT,
                    LiteGraph.NODE_TITLE_HEIGHT
                );
            }
            ctx.fillStyle = "#FFF";
            ctx.fillText(
                node.order,
                node.pos[0] + LiteGraph.NODE_TITLE_HEIGHT * -0.5,
                node.pos[1] - 6
            );
        }
        ctx.globalAlpha = 1;
    };

    /**
     * draws the widgets stored inside a node
     * @method drawNodeWidgets
     **/
    LGraphCanvas.prototype.drawNodeWidgets = function(
        node,
        posY,
        ctx,
        active_widget
    ) {
        if (!node.widgets || !node.widgets.length) {
            return 0;
        }
        var width = node.size[0];
        var widgets = node.widgets;
        posY += 2;
        var H = LiteGraph.NODE_WIDGET_HEIGHT;
        var show_text = this.ds.scale > 0.5;
        ctx.save();
        ctx.globalAlpha = this.editor_alpha;
        var outline_color = LiteGraph.WIDGET_OUTLINE_COLOR;
        var background_color = LiteGraph.WIDGET_BGCOLOR;
        var text_color = LiteGraph.WIDGET_TEXT_COLOR;
		var secondary_text_color = LiteGraph.WIDGET_SECONDARY_TEXT_COLOR;
        var margin = 15;

        for (var i = 0; i < widgets.length; ++i) {
            var w = widgets[i];
            var y = posY;
            if (w.y) {
                y = w.y;
            }
            w.last_y = y;
            ctx.strokeStyle = outline_color;
            ctx.fillStyle = "#222";
            ctx.textAlign = "left";
			//ctx.lineWidth = 2;
			if(w.disabled)
				ctx.globalAlpha *= 0.5;
			var widget_width = w.width || width;

            switch (w.type) {
                case "button":
                    if (w.clicked) {
                        ctx.fillStyle = "#AAA";
                        w.clicked = false;
                        this.dirty_canvas = true;
                    }
                    ctx.fillRect(margin, y, widget_width - margin * 2, H);
					if(show_text && !w.disabled)
	                    ctx.strokeRect( margin, y, widget_width - margin * 2, H );
                    if (show_text) {
                        ctx.textAlign = "center";
                        ctx.fillStyle = text_color;
                        ctx.fillText(w.name, widget_width * 0.5, y + H * 0.7);
                    }
                    break;
                case "toggle":
                    ctx.textAlign = "left";
                    ctx.strokeStyle = outline_color;
                    ctx.fillStyle = background_color;
                    ctx.beginPath();
                    if (show_text)
	                    ctx.roundRect(margin, y, widget_width - margin * 2, H, [H * 0.5]);
					else
	                    ctx.rect(margin, y, widget_width - margin * 2, H );
                    ctx.fill();
					if(show_text && !w.disabled)
	                    ctx.stroke();
                    ctx.fillStyle = w.value ? "#89A" : "#333";
                    ctx.beginPath();
                    ctx.arc( widget_width - margin * 2, y + H * 0.5, H * 0.36, 0, Math.PI * 2 );
                    ctx.fill();
                    if (show_text) {
                        ctx.fillStyle = secondary_text_color;
                        if (w.name != null) {
                            ctx.fillText(w.name, margin * 2, y + H * 0.7);
                        }
                        ctx.fillStyle = w.value ? text_color : secondary_text_color;
                        ctx.textAlign = "right";
                        ctx.fillText(
                            w.value
                                ? w.options.on || "true"
                                : w.options.off || "false",
                            widget_width - 40,
                            y + H * 0.7
                        );
                    }
                    break;
                case "slider":
                    ctx.fillStyle = background_color;
                    ctx.fillRect(margin, y, widget_width - margin * 2, H);
                    var range = w.options.max - w.options.min;
                    var nvalue = (w.value - w.options.min) / range;
                    ctx.fillStyle = active_widget == w ? "#89A" : "#678";
                    ctx.fillRect(margin, y, nvalue * (widget_width - margin * 2), H);
					if(show_text && !w.disabled)
	                    ctx.strokeRect(margin, y, widget_width - margin * 2, H);
                    if (w.marker) {
                        var marker_nvalue = (w.marker - w.options.min) / range;
                        ctx.fillStyle = "#AA9";
                        ctx.fillRect( margin + marker_nvalue * (widget_width - margin * 2), y, 2, H );
                    }
                    if (show_text) {
                        ctx.textAlign = "center";
                        ctx.fillStyle = text_color;
                        ctx.fillText(
                            w.name + "  " + Number(w.value).toFixed(3),
                            widget_width * 0.5,
                            y + H * 0.7
                        );
                    }
                    break;
                case "number":
                case "combo":
                    ctx.textAlign = "left";
                    ctx.strokeStyle = outline_color;
                    ctx.fillStyle = background_color;
                    ctx.beginPath();
					if(show_text)
	                    ctx.roundRect(margin, y, widget_width - margin * 2, H, [H * 0.5] );
					else
	                    ctx.rect(margin, y, widget_width - margin * 2, H );
                    ctx.fill();
                    if (show_text) {
						if(!w.disabled)
		                    ctx.stroke();
                        ctx.fillStyle = text_color;
						if(!w.disabled)
						{
							ctx.beginPath();
							ctx.moveTo(margin + 16, y + 5);
							ctx.lineTo(margin + 6, y + H * 0.5);
							ctx.lineTo(margin + 16, y + H - 5);
							ctx.fill();
							ctx.beginPath();
							ctx.moveTo(widget_width - margin - 16, y + 5);
							ctx.lineTo(widget_width - margin - 6, y + H * 0.5);
							ctx.lineTo(widget_width - margin - 16, y + H - 5);
							ctx.fill();
						}
                        ctx.fillStyle = secondary_text_color;
                        ctx.fillText(w.name, margin * 2 + 5, y + H * 0.7);
                        ctx.fillStyle = text_color;
                        ctx.textAlign = "right";
                        if (w.type == "number") {
                            ctx.fillText(
                                Number(w.value).toFixed(
                                    w.options.precision !== undefined
                                        ? w.options.precision
                                        : 3
                                ),
                                widget_width - margin * 2 - 20,
                                y + H * 0.7
                            );
                        } else {
							var v = w.value;
							if( w.options.values )
							{
								var values = w.options.values;
								if( values.constructor === Function )
									values = values();
								if(values && values.constructor !== Array)
									v = values[ w.value ];
							}
                            ctx.fillText(
                                v,
                                widget_width - margin * 2 - 20,
                                y + H * 0.7
                            );
                        }
                    }
                    break;
                case "string":
                case "text":
                    ctx.textAlign = "left";
                    ctx.strokeStyle = outline_color;
                    ctx.fillStyle = background_color;
                    ctx.beginPath();
                    if (show_text)
	                    ctx.roundRect(margin, y, widget_width - margin * 2, H, [H * 0.5]);
					else
	                    ctx.rect( margin, y, widget_width - margin * 2, H );
                    ctx.fill();
	                if (show_text) {
						if(!w.disabled)
							ctx.stroke();
    					ctx.save();
						ctx.beginPath();
						ctx.rect(margin, y, widget_width - margin * 2, H);
						ctx.clip();

	                    //ctx.stroke();
                        ctx.fillStyle = secondary_text_color;
                        if (w.name != null) {
                            ctx.fillText(w.name, margin * 2, y + H * 0.7);
                        }
                        ctx.fillStyle = text_color;
                        ctx.textAlign = "right";
                        ctx.fillText(String(w.value).substr(0,30), widget_width - margin * 2, y + H * 0.7); //30 chars max
						ctx.restore();
                    }
                    break;
                default:
                    if (w.draw) {
                        w.draw(ctx, node, widget_width, y, H);
                    }
                    break;
            }
            posY += (w.computeSize ? w.computeSize(widget_width)[1] : H) + 4;
			ctx.globalAlpha = this.editor_alpha;

        }
        ctx.restore();
		ctx.textAlign = "left";
    };

    /**
     * process an event on widgets
     * @method processNodeWidgets
     **/
    LGraphCanvas.prototype.processNodeWidgets = function(
        node,
        pos,
        event,
        active_widget
    ) {
        if (!node.widgets || !node.widgets.length) {
            return null;
        }

        var x = pos[0] - node.pos[0];
        var y = pos[1] - node.pos[1];
        var width = node.size[0];
        var that = this;
        var ref_window = this.getCanvasWindow();

        for (var i = 0; i < node.widgets.length; ++i) {
            var w = node.widgets[i];
			if(!w || w.disabled)
				continue;
			var widget_height = w.computeSize ? w.computeSize(width)[1] : LiteGraph.NODE_WIDGET_HEIGHT;
			var widget_width = w.width || width;
			//outside
			if ( w != active_widget &&
				(x < 6 || x > widget_width - 12 || y < w.last_y || y > w.last_y + widget_height || w.last_y === undefined) )
				continue;

			var old_value = w.value;

            //if ( w == active_widget || (x > 6 && x < widget_width - 12 && y > w.last_y && y < w.last_y + widget_height) ) {
			//inside widget
			switch (w.type) {
				case "button":
					if (event.type === LiteGraph.pointerevents_method+"down") {
                        if (w.callback) {
                            setTimeout(function() {
                                w.callback(w, that, node, pos, event);
                            }, 20);
                        }
                        w.clicked = true;
                        this.dirty_canvas = true;
                    }
					break;
				case "slider":
					var range = w.options.max - w.options.min;
					var nvalue = Math.clamp((x - 15) / (widget_width - 30), 0, 1);
					w.value = w.options.min + (w.options.max - w.options.min) * nvalue;
					if (w.callback) {
						setTimeout(function() {
							inner_value_change(w, w.value);
						}, 20);
					}
					this.dirty_canvas = true;
					break;
				case "number":
				case "combo":
					var old_value = w.value;
					if (event.type == LiteGraph.pointerevents_method+"move" && w.type == "number") {
						w.value += event.deltaX * 0.1 * (w.options.step || 1);
						if ( w.options.min != null && w.value < w.options.min ) {
							w.value = w.options.min;
						}
						if ( w.options.max != null && w.value > w.options.max ) {
							w.value = w.options.max;
						}
					} else if (event.type == LiteGraph.pointerevents_method+"down") {
						var values = w.options.values;
						if (values && values.constructor === Function) {
							values = w.options.values(w, node);
						}
						var values_list = null;

						if( w.type != "number")
							values_list = values.constructor === Array ? values : Object.keys(values);

						var delta = x < 40 ? -1 : x > widget_width - 40 ? 1 : 0;
						if (w.type == "number") {
							w.value += delta * 0.1 * (w.options.step || 1);
							if ( w.options.min != null && w.value < w.options.min ) {
								w.value = w.options.min;
							}
							if ( w.options.max != null && w.value > w.options.max ) {
								w.value = w.options.max;
							}
						} else if (delta) { //clicked in arrow, used for combos
							var index = -1;
							this.last_mouseclick = 0; //avoids dobl click event
							if(values.constructor === Object)
								index = values_list.indexOf( String( w.value ) ) + delta;
							else
								index = values_list.indexOf( w.value ) + delta;
							if (index >= values_list.length) {
								index = values_list.length - 1;
							}
							if (index < 0) {
								index = 0;
							}
							if( values.constructor === Array )
								w.value = values[index];
							else
								w.value = index;
						} else { //combo clicked
							var text_values = values != values_list ? Object.values(values) : values;
							var menu = new LiteGraph.ContextMenu(text_values, {
									scale: Math.max(1, this.ds.scale),
									event: event,
									className: "dark",
									callback: inner_clicked.bind(w)
								},
								ref_window);
							function inner_clicked(v, option, event) {
								if(values != values_list)
									v = text_values.indexOf(v);
								this.value = v;
								inner_value_change(this, v);
								that.dirty_canvas = true;
								return false;
							}
						}
					} //end mousedown
					else if(event.type == LiteGraph.pointerevents_method+"up" && w.type == "number")
					{
						var delta = x < 40 ? -1 : x > widget_width - 40 ? 1 : 0;
						if (event.click_time < 200 && delta == 0) {
							this.prompt("Value",w.value,function(v) {
									this.value = Number(v);
									inner_value_change(this, this.value);
								}.bind(w),
								event);
						}
					}

					if( old_value != w.value )
						setTimeout(
							function() {
								inner_value_change(this, this.value);
							}.bind(w),
							20
						);
					this.dirty_canvas = true;
					break;
				case "toggle":
					if (event.type == LiteGraph.pointerevents_method+"down") {
						w.value = !w.value;
						setTimeout(function() {
							inner_value_change(w, w.value);
						}, 20);
					}
					break;
				case "string":
				case "text":
					if (event.type == LiteGraph.pointerevents_method+"down") {
						this.prompt("Value",w.value,function(v) {
								this.value = v;
								inner_value_change(this, v);
							}.bind(w),
							event,w.options ? w.options.multiline : false );
					}
					break;
				default:
					if (w.mouse) {
						this.dirty_canvas = w.mouse(event, [x, y], node);
					}
					break;
			} //end switch

			//value changed
			if( old_value != w.value )
			{
				if(node.onWidgetChanged)
					node.onWidgetChanged( w.name,w.value,old_value,w );
                node.graph._version++;
			}

			return w;
        }//end for

        function inner_value_change(widget, value) {
            widget.value = value;
            if ( widget.options && widget.options.property && node.properties[widget.options.property] !== undefined ) {
                node.setProperty( widget.options.property, value );
            }
            if (widget.callback) {
                widget.callback(widget.value, that, node, pos, event);
            }
        }

        return null;
    };

    /**
     * draws every comment area in the background
     * @method drawComments
     **/
    LGraphCanvas.prototype.drawComments = function(canvas, ctx) {
        if (!this.graph) {
            return;
        }

        var comments = this.graph._comments;

        ctx.save();
        ctx.globalAlpha = 0.5 * this.editor_alpha;

        for (var i = 0; i < comments.length; ++i) {
            var comment = comments[i];

            if (!overlapBounding(this.visible_area, comment._bounding)) {
                continue;
            } //out of the visible area

            ctx.fillStyle = comment.color || "#335";
            ctx.strokeStyle = comment.color || "#335";
            var pos = comment._pos;
            var size = comment._size;
            ctx.globalAlpha = 0.25 * this.editor_alpha;
            ctx.beginPath();
            ctx.rect(pos[0] + 0.5, pos[1] + 0.5, size[0], size[1]);
            ctx.fill();
            ctx.globalAlpha = this.editor_alpha;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(pos[0] + size[0], pos[1] + size[1]);
            ctx.lineTo(pos[0] + size[0] - 10, pos[1] + size[1]);
            ctx.lineTo(pos[0] + size[0], pos[1] + size[1] - 10);
            ctx.fill();

            var font_size =
                comment.font_size || LiteGraph.DEFAULT_GROUP_FONT_SIZE;
            ctx.font = font_size + "px Arial";
			ctx.textAlign = "left";
            ctx.fillText(comment.title, pos[0] + 4, pos[1] - 2);
        }

        ctx.restore();
    };

    LGraphCanvas.prototype.adjustNodesSize = function() {
        var nodes = this.graph._nodes;
        for (var i = 0; i < nodes.length; ++i) {
            nodes[i].size = nodes[i].computeSize();
        }
        this.setDirty(true, true);
    };

    /**
     * resizes the canvas to a given size, if no size is passed, then it tries to fill the parentNode
     * @method resize
     **/
    LGraphCanvas.prototype.resize = function(width, height) {
        if (!width && !height) {
            if(!this.fullscreen){
                var parent = this.canvas.parentNode;
                width = parent.offsetWidth;
                //note: parent height is flexible,
                //so we set the canvas height to the default
                height = this.default_height;
            } else {
                width = document.body.clientWidth;
                height = document.body.clientHeight;
            }
        }

        if (this.canvas.width == width && this.canvas.height == height) {
            return;
        }

        this.canvas.width = width;
        this.canvas.height = height;
        this.bgcanvas.width = this.canvas.width;
        this.bgcanvas.height = this.canvas.height;
        this.setDirty(true, true);
    };

    /**
     * switches to live mode (node shapes are not rendered, only the content)
     * this feature was designed when graphs where meant to create user interfaces
     * @method switchLiveMode
     **/
    LGraphCanvas.prototype.switchLiveMode = function(transition) {
        if (!transition) {
            this.live_mode = !this.live_mode;
            this.dirty_canvas = true;
            this.dirty_bgcanvas = true;
            return;
        }

        var self = this;
        var delta = this.live_mode ? 1.1 : 0.9;
        if (this.live_mode) {
            this.live_mode = false;
            this.editor_alpha = 0.1;
        }

        var t = setInterval(function() {
            self.editor_alpha *= delta;
            self.dirty_canvas = true;
            self.dirty_bgcanvas = true;

            if (delta < 1 && self.editor_alpha < 0.01) {
                clearInterval(t);
                if (delta < 1) {
                    self.live_mode = true;
                }
            }
            if (delta > 1 && self.editor_alpha > 0.99) {
                clearInterval(t);
                self.editor_alpha = 1;
            }
        }, 1);
    };

    LGraphCanvas.prototype.onNodeSelectionChange = function(node) {
        return; //disabled
    };

    /* CONTEXT MENU ********************/

    LGraphCanvas.onCommentAdd = function(info, entry, mouse_event) {
        var canvas = LGraphCanvas.active_canvas;
        var comment = new LiteGraph.LGraphComment();
        comment.pos = canvas.convertEventToCanvasOffset(mouse_event);
        canvas.graph.add(comment);
    };

    LGraphCanvas.onMenuAdd = function (node, options, e, prev_menu, callback) {

        var canvas = LGraphCanvas.active_canvas;
        var ref_window = canvas.getCanvasWindow();
        var graph = canvas.graph;
        if (!graph)
            return;

        function inner_onMenuAdded(base_category ,prev_menu){

            var categories  = LiteGraph.getNodeTypesCategories(canvas.filter || graph.filter).filter(function(category){return category.startsWith(base_category)});
            var entries = [];

            categories.map(function(category){

                if (!category)
                    return;

                var base_category_regex = new RegExp('^(' + base_category + ')');
                var category_name = category.replace(base_category_regex,"").split('.')[0];
                var category_path = base_category  === '' ? category_name + '.' : base_category + category_name + '.';

                var name = category_name;
                if(name.indexOf("::") != -1) //in case it has a namespace like "shader::math/rand" it hides the namespace
                    name = name.split("::")[1];

                var index = entries.findIndex(function(entry){return entry.value === category_path});
                if (index === -1) {
                    entries.push({ value: category_path, content: name, has_submenu: true, callback : function(value, event, mouseEvent, contextMenu){
                        inner_onMenuAdded(value.value, contextMenu)
                    }});
                }

            });

            var nodes = LiteGraph.getNodeTypesInCategory(base_category.slice(0, -1), canvas.filter || graph.filter );
            nodes.map(function(node){

                if (node.skip_list)
                    return;

                var entry = { value: node.type, content: node.title, has_submenu: false , callback : function(value, event, mouseEvent, contextMenu){

                        var first_event = contextMenu.getFirstEvent();
                        canvas.graph.beforeChange();
                        var node = LiteGraph.createNode(value.value);
                        if (node) {
                            node.pos = canvas.convertEventToCanvasOffset(first_event);
                            canvas.graph.add(node);
                        }
                        if(callback)
                            callback(node);
                        canvas.graph.afterChange();

                    }
                }

                entries.push(entry);

            });

            new LiteGraph.ContextMenu( entries, { event: e, parentMenu: prev_menu }, ref_window );

        }

        inner_onMenuAdded('',prev_menu);
        return false;

    };

    LGraphCanvas.onMenuCollapseAll = function() {};

	LGraphCanvas.onMenuArrange = function() {
		LGraphCanvas.active_canvas.graph.arrange();
	}
	LGraphCanvas.onMenuToggleMinimap = function() {
		LGraphCanvas.active_canvas.toggleMinimap();
	};

    LGraphCanvas.onMenuNodeEdit = function() {};

    LGraphCanvas.showMenuNodeOptionalInputs = function(
        v,
        options,
        e,
        prev_menu,
        node
    ) {
        if (!node) {
            return;
        }

        var that = this;
        var canvas = LGraphCanvas.active_canvas;
        var ref_window = canvas.getCanvasWindow();

        var options = node.optional_inputs;
        if (node.onGetInputs) {
            options = node.onGetInputs();
        }

        var entries = [];
        if (options) {
            for (var i=0; i < options.length; i++) {
                var entry = options[i];
                if (!entry) {
                    entries.push(null);
                    continue;
                }
                var label = entry[0];
				if(!entry[2])
					entry[2] = {};

                if (entry[2].label) {
                    label = entry[2].label;
                }

				entry[2].removable = true;
                var data = { content: label, value: entry };
                if (entry[1] == LiteGraph.ACTION) {
                    data.className = "event";
                }
                entries.push(data);
            }
        }

        if (node.onMenuNodeInputs) {
            var retEntries = node.onMenuNodeInputs(entries);
            if(retEntries) entries = retEntries;
        }

        if (!entries.length) {
			console.log("no input entries");
            return;
        }

        var menu = new LiteGraph.ContextMenu(
            entries,
            {
                event: e,
                callback: inner_clicked,
                parentMenu: prev_menu,
                node: node
            },
            ref_window
        );

        function inner_clicked(v, e, prev) {
            if (!node) {
                return;
            }

            if (v.callback) {
                v.callback.call(that, node, v, e, prev);
            }

            if (v.value) {
				node.graph.beforeChange();
                node.addInput(v.value[0], v.value[1], v.value[2]);

                if (node.onNodeInputAdd) { // callback to the node when adding a slot
                    node.onNodeInputAdd(v.value);
                }
                node.setDirtyCanvas(true, true);
				node.graph.afterChange();
            }
        }

        return false;
    };

    LGraphCanvas.showMenuNodeOptionalOutputs = function(
        v,
        options,
        e,
        prev_menu,
        node
    ) {
        if (!node) {
            return;
        }

        var that = this;
        var canvas = LGraphCanvas.active_canvas;
        var ref_window = canvas.getCanvasWindow();

        var options = node.optional_outputs;
        if (node.onGetOutputs) {
            options = node.onGetOutputs();
        }

        var entries = [];
        if (options) {
            for (var i=0; i < options.length; i++) {
                var entry = options[i];
                if (!entry) {
                    //separator?
                    entries.push(null);
                    continue;
                }

                if (
                    node.flags  &&
                    node.findOutputSlot(entry[0]) != -1
                ) {
                    continue;
                } //skip the ones already on
                var label = entry[0];
				if(!entry[2])
					entry[2] = {};
                if (entry[2].label) {
                    label = entry[2].label;
                }
				entry[2].removable = true;
                var data = { content: label, value: entry };
                if (entry[1] == LiteGraph.EVENT) {
                    data.className = "event";
                }
                entries.push(data);
            }
        }

        if (this.onMenuNodeOutputs) {
            entries = this.onMenuNodeOutputs(entries);
        }
        if (LiteGraph.do_add_triggers_slots){ //canvas.allow_addOutSlot_onExecuted
            if (node.findOutputSlot("onExecuted") == -1){
                entries.push({content: "On Executed", value: ["onExecuted", LiteGraph.EVENT, {nameLocked: true}], className: "event"}); //, opts: {}
            }
        }
        // add callback for modifing the menu elements onMenuNodeOutputs
        if (node.onMenuNodeOutputs) {
            var retEntries = node.onMenuNodeOutputs(entries);
            if(retEntries) entries = retEntries;
        }

        if (!entries.length) {
            return;
        }

        var menu = new LiteGraph.ContextMenu(
            entries,
            {
                event: e,
                callback: inner_clicked,
                parentMenu: prev_menu,
                node: node
            },
            ref_window
        );

        function inner_clicked(v, e, prev) {
            if (!node) {
                return;
            }

            if (v.callback) {
                v.callback.call(that, node, v, e, prev);
            }

            if (!v.value) {
                return;
            }

            var value = v.value[1];

            if (
                value &&
                (value.constructor === Object || value.constructor === Array)
            ) {
                //submenu why?
                var entries = [];
                for (var i in value) {
                    entries.push({ content: i, value: value[i] });
                }
                new LiteGraph.ContextMenu(entries, {
                    event: e,
                    callback: inner_clicked,
                    parentMenu: prev_menu,
                    node: node
                });
                return false;
            } else {
				node.graph.beforeChange();
                node.addOutput(v.value[0], v.value[1], v.value[2]);

                if (node.onNodeOutputAdd) { // a callback to the node when adding a slot
                    node.onNodeOutputAdd(v.value);
                }
                node.setDirtyCanvas(true, true);
				node.graph.afterChange();
            }
        }

        return false;
    };

    LGraphCanvas.onShowMenuNodeProperties = function(
        value,
        options,
        e,
        prev_menu,
        node
    ) {
        if (!node || !node.properties) {
            return;
        }

        var that = this;
        var canvas = LGraphCanvas.active_canvas;
        var ref_window = canvas.getCanvasWindow();

        var entries = [];
        for (var i in node.properties) {
            var value = node.properties[i] !== undefined ? node.properties[i] : " ";
			if( typeof value == "object" )
				value = JSON.stringify(value);
			var info = node.getPropertyInfo(i);
			if(info.type == "enum" || info.type == "combo")
				value = LGraphCanvas.getPropertyPrintableValue( value, info.values );

            //value could contain invalid html characters, clean that
            value = LGraphCanvas.decodeHTML(value);
            entries.push({
                content:
                    "<span class='property_name'>" +
                    (info.label ? info.label : i) +
                    "</span>" +
                    "<span class='property_value'>" +
                    value +
                    "</span>",
                value: i
            });
        }
        if (!entries.length) {
            return;
        }

        var menu = new LiteGraph.ContextMenu(
            entries,
            {
                event: e,
                callback: inner_clicked,
                parentMenu: prev_menu,
                allow_html: true,
                node: node
            },
            ref_window
        );

        function inner_clicked(v, options, e, prev) {
            if (!node) {
                return;
            }
            var rect = this.getBoundingClientRect();
            canvas.showEditPropertyValue(node, v.value, {
                position: [rect.left, rect.top]
            });
        }

        return false;
    };

    LGraphCanvas.decodeHTML = function(str) {
        var e = document.createElement("div");
        e.innerText = str;
        return e.innerHTML;
    };

    LGraphCanvas.onMenuResizeNode = function(value, options, e, menu, node) {
        if (!node) {
            return;
        }

		var fApplyMultiNode = function(node){
			node.size = node.computeSize();
			if (node.onResize)
				node.onResize(node.size);
		}

		var graphcanvas = LGraphCanvas.active_canvas;
		if (!graphcanvas.selected_nodes || Object.keys(graphcanvas.selected_nodes).length <= 1){
			fApplyMultiNode(node);
		}else{
			for (var i in graphcanvas.selected_nodes) {
				fApplyMultiNode(graphcanvas.selected_nodes[i]);
			}
		}

        node.setDirtyCanvas(true, true);
    };

    LGraphCanvas.prototype.showLinkMenu = function(link, e) {
        var that = this;
		// console.log(link);
		var node_left = that.graph.getNodeById( link.out_node_id );
		var node_right = that.graph.getNodeById( link.in_node_id );
		var fromType = false;
		if (node_left && node_left.outputs && node_left.outputs[link.out_slot_name]) fromType = node_left.outputs[link.out_slot_name].type;
        var destType = false;
		if (node_right && node_right.outputs && node_right.outputs[link.in_slot_name]) destType = node_right.inputs[link.in_slot_name].type;

		var options = ["Add Node",null,"Delete",null];


        var menu = new LiteGraph.ContextMenu(options, {
            event: e,
			title: link.data != null ? link.data.constructor.name : null,
            callback: inner_clicked
        });

        function inner_clicked(v,options,e) {
            switch (v) {
                case "Add Node":
					LGraphCanvas.onMenuAdd(null, null, e, menu, function(node){
						// console.debug("node autoconnect");
						if(!node.inputs || !node.inputs.length || !node.outputs || !node.outputs.length){
							return;
						}
						// leave the connection type checking inside connectByType
						if (node_left.connectByType( link.out_slot_name, node, fromType )){
                        	node.connectByType( link.in_slot_name, node_right, destType );
                            node.pos[0] -= node.size[0] * 0.5;
                        }
					});
					break;

                case "Delete":
                    that.graph.removeLink(link.id);
                    break;
                default:
            }
        }

        return false;
    };

 	LGraphCanvas.prototype.createDefaultNodeForSlot = function(optPass) { // addNodeMenu for connection
        var optPass = optPass || {};
        var opts = Object.assign({   nodeFrom: null // input
                                    ,slotFrom: null // input
                                    ,nodeTo: null   // output
                                    ,slotTo: null   // output
                                    ,position: []	// pass the event coords
								  	,nodeType: null	// choose a nodetype to add, AUTO to set at first good
								  	,posAdd:[0,0]	// adjust x,y
								  	,posSizeFix:[0,0] // alpha, adjust the position x,y based on the new node size w,h
                                }
                                ,optPass
                            );
        var that = this;

        var isFrom = opts.nodeFrom && opts.slotFrom!==null;
        var isTo = !isFrom && opts.nodeTo && opts.slotTo!==null;

        if (!isFrom && !isTo){
            console.warn("No data passed to createDefaultNodeForSlot "+opts.nodeFrom+" "+opts.slotFrom+" "+opts.nodeTo+" "+opts.slotTo);
            return false;
        }
		if (!opts.nodeType){
            console.warn("No type to createDefaultNodeForSlot");
            return false;
        }

        var nodeX = isFrom ? opts.nodeFrom : opts.nodeTo;
        var slotX = isFrom ? opts.slotFrom : opts.slotTo;

        var iSlotConn = false;
        switch (typeof slotX){
            case "string":
                iSlotConn = isFrom ? nodeX.findOutputSlot(slotX,false) : nodeX.findInputSlot(slotX,false);
                slotX = isFrom ? nodeX.outputs[slotX] : nodeX.inputs[slotX];
            break;
            case "object":
                // ok slotX
                iSlotConn = isFrom ? nodeX.findOutputSlot(slotX.name) : nodeX.findInputSlot(slotX.name);
            break;
            case "number":
                iSlotConn = slotX;
                slotX = isFrom ? nodeX.outputs[slotX] : nodeX.inputs[slotX];
            break;
			case "undefined":
            default:
                // bad ?
                //iSlotConn = 0;
                console.warn("Cant get slot information "+slotX);
                return false;
        }

		if (slotX===false || iSlotConn===false){
			console.warn("createDefaultNodeForSlot bad slotX "+slotX+" "+iSlotConn);
		}

		// check for defaults nodes for this slottype
		var fromSlotType = slotX.type==LiteGraph.EVENT?"_event_":slotX.type;
		var slotTypesDefault = isFrom ? LiteGraph.slot_types_default_out : LiteGraph.slot_types_default_in;
		if(slotTypesDefault && slotTypesDefault[fromSlotType]){
			if (slotX.link !== null) {
				// is connected
			}else{
				// is not not connected
			}
			nodeNewType = false;
			if(typeof slotTypesDefault[fromSlotType] == "object" || typeof slotTypesDefault[fromSlotType] == "array"){
				for(var typeX in slotTypesDefault[fromSlotType]){
					if (opts.nodeType == slotTypesDefault[fromSlotType][typeX] || opts.nodeType == "AUTO"){
						nodeNewType = slotTypesDefault[fromSlotType][typeX];
						// console.log("opts.nodeType == slotTypesDefault[fromSlotType][typeX] :: "+opts.nodeType);
						break; // --------
					}
				}
			}else{
				if (opts.nodeType == slotTypesDefault[fromSlotType] || opts.nodeType == "AUTO") nodeNewType = slotTypesDefault[fromSlotType];
			}
			if (nodeNewType) {
				var nodeNewOpts = false;
				if (typeof nodeNewType == "object" && nodeNewType.node){
					nodeNewOpts = nodeNewType;
					nodeNewType = nodeNewType.node;
				}

				//that.graph.beforeChange();

				var newNode = LiteGraph.createNode(nodeNewType);
				if(newNode){
					// if is object pass options
					if (nodeNewOpts){
						if (nodeNewOpts.properties) {
							for (var i in nodeNewOpts.properties) {
								newNode.addProperty( i, nodeNewOpts.properties[i] );
							}
						}
						if (nodeNewOpts.inputs) {
							newNode.inputs = [];
							for (var i in nodeNewOpts.inputs) {
								newNode.addOutput(
									nodeNewOpts.inputs[i][0],
									nodeNewOpts.inputs[i][1]
								);
							}
						}
						if (nodeNewOpts.outputs) {
							newNode.outputs = [];
							for (var i in nodeNewOpts.outputs) {
								newNode.addOutput(
									nodeNewOpts.outputs[i][0],
									nodeNewOpts.outputs[i][1]
								);
							}
						}
						if (nodeNewOpts.title) {
							newNode.title = nodeNewOpts.title;
						}
						if (nodeNewOpts.json) {
							newNode.configure(nodeNewOpts.json);
						}

					}

					// add the node
					that.graph.add(newNode);
					newNode.pos = [	opts.position[0]+opts.posAdd[0]+(opts.posSizeFix[0]?opts.posSizeFix[0]*newNode.size[0]:0)
								   	,opts.position[1]+opts.posAdd[1]+(opts.posSizeFix[1]?opts.posSizeFix[1]*newNode.size[1]:0)]; //that.last_click_position; //[e.canvasX+30, e.canvasX+5];*/

					//that.graph.afterChange();

					// connect the two!
					if (isFrom){
						opts.nodeFrom.connectByType( iSlotConn, newNode, fromSlotType );
					}else{
						opts.nodeTo.connectByTypeOutput( iSlotConn, newNode, fromSlotType );
					}

					// if connecting in between
					if (isFrom && isTo){
						// TODO
					}

					return true;

				}else{
					console.log("failed creating "+nodeNewType);
				}
			}
		}
		return false;
	}

    LGraphCanvas.prototype.showConnectionMenu = function(optPass) { // addNodeMenu for connection
        var optPass = optPass || {};
        var opts = Object.assign({   nodeFrom: null  // input
                                    ,slotFrom: null // input
                                    ,nodeTo: null   // output
                                    ,slotTo: null   // output
                                    ,e: null
                                }
                                ,optPass
                            );
        var that = this;

        var isFrom = opts.nodeFrom && opts.slotFrom;
        var isTo = !isFrom && opts.nodeTo && opts.slotTo;

        if (!isFrom && !isTo){
            console.warn("No data passed to showConnectionMenu");
            return false;
        }

        var nodeX = isFrom ? opts.nodeFrom : opts.nodeTo;
        var slotX = isFrom ? opts.slotFrom : opts.slotTo;

        var iSlotConn = false;
        switch (typeof slotX){
            case "string":
                iSlotConn = isFrom ? nodeX.findOutputSlot(slotX,false) : nodeX.findInputSlot(slotX,false);
                slotX = isFrom ? nodeX.outputs[slotX] : nodeX.inputs[slotX];
            break;
            case "object":
                // ok slotX
                iSlotConn = isFrom ? nodeX.findOutputSlot(slotX.name) : nodeX.findInputSlot(slotX.name);
            break;
            case "number":
                iSlotConn = slotX;
                slotX = isFrom ? nodeX.outputs[slotX] : nodeX.inputs[slotX];
            break;
            default:
                // bad ?
                //iSlotConn = 0;
                console.warn("Cant get slot information "+slotX);
                return false;
        }

		var options = ["Add Node",null];

		if (that.allow_searchbox){
			options.push("Search");
			options.push(null);
		}

		// get defaults nodes for this slottype
		var fromSlotType = slotX.type==LiteGraph.EVENT?"_event_":slotX.type;
		var slotTypesDefault = isFrom ? LiteGraph.slot_types_default_out : LiteGraph.slot_types_default_in;
		if(slotTypesDefault && slotTypesDefault[fromSlotType]){
			if(typeof slotTypesDefault[fromSlotType] == "object" || typeof slotTypesDefault[fromSlotType] == "array"){
				for(var typeX in slotTypesDefault[fromSlotType]){
					options.push(slotTypesDefault[fromSlotType][typeX]);
				}
			}else{
				options.push(slotTypesDefault[fromSlotType]);
			}
		}

		// build menu
        console.log('connection menu');
        var menu = new LiteGraph.ContextMenu(options, {
            event: opts.e,
			title: (slotX && slotX.name!="" ? (slotX.name + (fromSlotType?" | ":"")) : "")+(slotX && fromSlotType ? fromSlotType : ""),
            callback: inner_clicked
        });

		// callback
        function inner_clicked(v,options,e) {
            //console.log("Process showConnectionMenu selection");
            switch (v) {
                case "Add Node":
                    LGraphCanvas.onMenuAdd(null, null, e, menu, function(node){
                        if (isFrom){
                            opts.nodeFrom.connectByType( iSlotConn, node, fromSlotType );
                        }else{
                            opts.nodeTo.connectByTypeOutput( iSlotConn, node, fromSlotType );
                        }
                    });
                    break;
				case "Search":
					if(isFrom){
						that.showSearchBox(e,{node_from: opts.nodeFrom, slot_from: slotX, type_filter_in: fromSlotType});
					}else{
						that.showSearchBox(e,{node_to: opts.nodeTo, slot_from: slotX, type_filter_out: fromSlotType});
					}
					break;
                default:
					// check for defaults nodes for this slottype
					var nodeCreated = that.createDefaultNodeForSlot(Object.assign(opts,{ position: [opts.e.canvasX, opts.e.canvasY]
																						,nodeType: v
																					}));
					if (nodeCreated){
						// new node created
						//console.log("node "+v+" created")
					}else{
						// failed or v is not in defaults
					}
					break;
            }
        }

        return false;
    };

    // TODO refactor :: this is used fot title but not for properties!
    LGraphCanvas.onShowPropertyEditor = function(item, options, e, menu, node) {
        var input_html = "";
        var property = item.property || "title";
        var value = node[property];

        // TODO refactor :: use createDialog ?

        var dialog = document.createElement("div");
        dialog.is_modified = false;
        dialog.className = "graphdialog";
        dialog.innerHTML =
            "<span class='name'></span><input autofocus type='text' class='value'/><button>OK</button>";
        dialog.close = function() {
            if (dialog.parentNode) {
                dialog.parentNode.removeChild(dialog);
            }
        };
        var title = dialog.querySelector(".name");
        title.innerText = property;
        var input = dialog.querySelector(".value");
        if (input) {
            input.value = value;
            input.addEventListener("blur", function(e) {
                this.focus();
            });
            input.addEventListener("keydown", function(e) {
                dialog.is_modified = true;
                if (e.keyCode == 27) {
                    //ESC
                    dialog.close();
                } else if (e.keyCode == 13) {
                    inner(); // save
                } else if (e.keyCode != 13 && e.target.localName != "textarea") {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
            });
        }

        var graphcanvas = LGraphCanvas.active_canvas;
        var canvas = graphcanvas.canvas;

        var rect = canvas.getBoundingClientRect();
        var offsetx = -20;
        var offsety = -20;
        if (rect) {
            offsetx -= rect.left;
            offsety -= rect.top;
        }

        if (event) {
            dialog.style.left = event.clientX + offsetx + "px";
            dialog.style.top = event.clientY + offsety + "px";
        } else {
            dialog.style.left = canvas.width * 0.5 + offsetx + "px";
            dialog.style.top = canvas.height * 0.5 + offsety + "px";
        }

        var button = dialog.querySelector("button");
        button.addEventListener("click", inner);
        canvas.parentNode.appendChild(dialog);

        if(input) input.focus();

        var dialogCloseTimer = null;
        dialog.addEventListener("mouseleave", function(e) {
            if(LiteGraph.dialog_close_on_mouse_leave)
                if (!dialog.is_modified && LiteGraph.dialog_close_on_mouse_leave)
                    dialogCloseTimer = setTimeout(dialog.close, LiteGraph.dialog_close_on_mouse_leave_delay); //dialog.close();
        });
        dialog.addEventListener("mouseenter", function(e) {
            if(LiteGraph.dialog_close_on_mouse_leave)
                if(dialogCloseTimer) clearTimeout(dialogCloseTimer);
        });

        function inner() {
            if(input) setValue(input.value);
        }

        function setValue(value) {
            if (item.type == "Number") {
                value = Number(value);
            } else if (item.type == "Boolean") {
                value = Boolean(value);
            }
            node[property] = value;
            if (dialog.parentNode) {
                dialog.parentNode.removeChild(dialog);
            }
            node.setDirtyCanvas(true, true);
        }
    };

    // refactor: there are different dialogs, some uses createDialog some dont
    LGraphCanvas.prototype.prompt = function(title, value, callback, event, multiline) {
        var that = this;
        var input_html = "";
        title = title || "";

        var dialog = document.createElement("div");
        dialog.is_modified = false;
        dialog.className = "graphdialog rounded";
        if(multiline)
	        dialog.innerHTML = "<span class='name'></span> <textarea autofocus class='value'></textarea><button class='rounded'>OK</button>";
		else
        	dialog.innerHTML = "<span class='name'></span> <input autofocus type='text' class='value'/><button class='rounded'>OK</button>";
        dialog.close = function() {
            that.prompt_box = null;
            if (dialog.parentNode) {
                dialog.parentNode.removeChild(dialog);
            }
        };

        var graphcanvas = LGraphCanvas.active_canvas;
        var canvas = graphcanvas.canvas;
        canvas.parentNode.appendChild(dialog);

        if (this.ds.scale > 1) {
            dialog.style.transform = "scale(" + this.ds.scale + ")";
        }

        var dialogCloseTimer = null;
        var prevent_timeout = false;
        LiteGraph.pointerListenerAdd(dialog,"leave", function(e) {
            if (prevent_timeout)
                return;
            if(LiteGraph.dialog_close_on_mouse_leave)
                if (!dialog.is_modified && LiteGraph.dialog_close_on_mouse_leave)
                    dialogCloseTimer = setTimeout(dialog.close, LiteGraph.dialog_close_on_mouse_leave_delay); //dialog.close();
        });
        LiteGraph.pointerListenerAdd(dialog,"enter", function(e) {
            if(LiteGraph.dialog_close_on_mouse_leave)
                if(dialogCloseTimer) clearTimeout(dialogCloseTimer);
        });
        var selInDia = dialog.querySelectorAll("select");
        if (selInDia){
            // if filtering, check focus changed to comboboxes and prevent closing
            selInDia.forEach(function(selIn) {
                selIn.addEventListener("click", function(e) {
                    prevent_timeout++;
                });
                selIn.addEventListener("blur", function(e) {
                   prevent_timeout = 0;
                });
                selIn.addEventListener("change", function(e) {
                    prevent_timeout = -1;
                });
            });
        }

        if (that.prompt_box) {
            that.prompt_box.close();
        }
        that.prompt_box = dialog;

        var first = null;
        var timeout = null;
        var selected = null;

        var name_element = dialog.querySelector(".name");
        name_element.innerText = title;
        var value_element = dialog.querySelector(".value");
        value_element.value = value;

        var input = value_element;
        input.addEventListener("keydown", function(e) {
            dialog.is_modified = true;
            if (e.keyCode == 27) {
                //ESC
                dialog.close();
            } else if (e.keyCode == 13 && e.target.localName != "textarea") {
                if (callback) {
                    callback(this.value);
                }
                dialog.close();
            } else {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
        });

        var button = dialog.querySelector("button");
        button.addEventListener("click", function(e) {
            if (callback) {
                callback(input.value);
            }
            that.setDirty(true);
            dialog.close();
        });

        var rect = canvas.getBoundingClientRect();
        var offsetx = -20;
        var offsety = -20;
        if (rect) {
            offsetx -= rect.left;
            offsety -= rect.top;
        }

        if (event) {
            dialog.style.left = event.clientX + offsetx + "px";
            dialog.style.top = event.clientY + offsety + "px";
        } else {
            dialog.style.left = canvas.width * 0.5 + offsetx + "px";
            dialog.style.top = canvas.height * 0.5 + offsety + "px";
        }

        setTimeout(function() {
            input.focus();
        }, 10);

        return dialog;
    };

    LGraphCanvas.search_limit = -1;
    LGraphCanvas.prototype.showSearchBox = function(event, options) {
        // proposed defaults
        def_options = { slot_from: null
                        ,node_from: null
                        ,node_to: null
                        ,do_type_filter: LiteGraph.search_filter_enabled // TODO check for registered_slot_[in/out]_types not empty // this will be checked for functionality enabled : filter on slot type, in and out
                        ,type_filter_in: false                          // these are default: pass to set initially set values
                        ,type_filter_out: false
                        ,show_general_if_none_on_typefilter: true
                        ,show_general_after_typefiltered: true
                        ,hide_on_mouse_leave: LiteGraph.search_hide_on_mouse_leave
                        ,show_all_if_empty: true
                        ,show_all_on_open: LiteGraph.search_show_all_on_open
                    };
        options = Object.assign(def_options, options || {});

		//console.log(options);

        var that = this;
        var input_html = "";
        var graphcanvas = LGraphCanvas.active_canvas;
        var canvas = graphcanvas.canvas;
        var root_document = canvas.parentElement || document;

        var dialog = document.createElement("div");
        dialog.className = "litegraph litesearchbox graphdialog rounded";
        dialog.innerHTML = "<span class='name'>Search</span> <input autofocus type='text' class='value rounded'/>";
        if (options.do_type_filter){
            dialog.innerHTML += "<select class='slot_in_type_filter'><option value=''></option></select>";
            dialog.innerHTML += "<select class='slot_out_type_filter'><option value=''></option></select>";
        }
        dialog.innerHTML += "<div class='helper'></div>";

        if( root_document.fullscreenElement )
	        root_document.fullscreenElement.appendChild(dialog);
		else
		{
		    root_document.appendChild(dialog);
			root_document.style.overflow = "hidden";
		}
        // dialog element has been appended

        if (options.do_type_filter){
            var selIn = dialog.querySelector(".slot_in_type_filter");
            var selOut = dialog.querySelector(".slot_out_type_filter");
        }

        dialog.close = function() {
            that.search_box = null;
			this.blur();
            canvas.focus();
			root_document.style.overflow = "";

            setTimeout(function() {
                that.canvas.focus();
            }, 20); //important, if canvas loses focus keys wont be captured
            if (dialog.parentNode) {
                dialog.parentNode.removeChild(dialog);
            }
        };

        if (this.ds.scale > 1) {
            dialog.style.transform = "scale(" + this.ds.scale + ")";
        }

        // hide on mouse leave
        if(options.hide_on_mouse_leave){
            var prevent_timeout = false;
            var timeout_close = null;
            LiteGraph.pointerListenerAdd(dialog,"enter", function(e) {
                if (timeout_close) {
                    clearTimeout(timeout_close);
                    timeout_close = null;
                }
            });
            LiteGraph.pointerListenerAdd(dialog,"leave", function(e) {
                if (prevent_timeout){
                    return;
                }
                timeout_close = setTimeout(function() {
                    dialog.close();
                }, 500);
            });
            // if filtering, check focus changed to comboboxes and prevent closing
            if (options.do_type_filter){
                selIn.addEventListener("click", function(e) {
                    prevent_timeout++;
                });
                selIn.addEventListener("blur", function(e) {
                   prevent_timeout = 0;
                });
                selIn.addEventListener("change", function(e) {
                    prevent_timeout = -1;
                });
                selOut.addEventListener("click", function(e) {
                    prevent_timeout++;
                });
                selOut.addEventListener("blur", function(e) {
                   prevent_timeout = 0;
                });
                selOut.addEventListener("change", function(e) {
                    prevent_timeout = -1;
                });
            }
        }

        if (that.search_box) {
            that.search_box.close();
        }
        that.search_box = dialog;

        var helper = dialog.querySelector(".helper");

        var first = null;
        var timeout = null;
        var selected = null;

        var input = dialog.querySelector("input");
        if (input) {
            input.addEventListener("blur", function(e) {
                this.focus();
            });
            input.addEventListener("keydown", function(e) {
                if (e.keyCode == 38) {
                    //UP
                    changeSelection(false);
                } else if (e.keyCode == 40) {
                    //DOWN
                    changeSelection(true);
                } else if (e.keyCode == 27) {
                    //ESC
                    dialog.close();
                } else if (e.keyCode == 13) {
                    if (selected) {
                        select(selected.innerHTML);
                    } else if (first) {
                        select(first);
                    } else {
                        dialog.close();
                    }
                } else {
                    if (timeout) {
                        clearInterval(timeout);
                    }
                    timeout = setTimeout(refreshHelper, 250);
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
				e.stopImmediatePropagation();
				return true;
            });
        }

        // if should filter on type, load and fill selected and choose elements if passed
        if (options.do_type_filter){
            if (selIn){
                var aSlots = LiteGraph.slot_types_in;
                var nSlots = aSlots.length; // this for object :: Object.keys(aSlots).length;

                if (options.type_filter_in == LiteGraph.EVENT || options.type_filter_in == LiteGraph.ACTION)
                    options.type_filter_in = "_event_";
                /* this will filter on * .. but better do it manually in case
                else if(options.type_filter_in === "" || options.type_filter_in === 0)
                    options.type_filter_in = "*";*/

                for (var iK=0; iK<nSlots; iK++){
                    var opt = document.createElement('option');
                    opt.value = aSlots[iK];
                    opt.innerHTML = aSlots[iK];
                    selIn.appendChild(opt);
                    if(options.type_filter_in !==false && (options.type_filter_in+"").toLowerCase() == (aSlots[iK]+"").toLowerCase()){
                        //selIn.selectedIndex ..
                        opt.selected = true;
						//console.log("comparing IN "+options.type_filter_in+" :: "+aSlots[iK]);
	                }else{
						//console.log("comparing OUT "+options.type_filter_in+" :: "+aSlots[iK]);
					}
				}
                selIn.addEventListener("change",function(){
                    refreshHelper();
                });
            }
            if (selOut){
                var aSlots = LiteGraph.slot_types_out;
                var nSlots = aSlots.length; // this for object :: Object.keys(aSlots).length;

                if (options.type_filter_out == LiteGraph.EVENT || options.type_filter_out == LiteGraph.ACTION)
                    options.type_filter_out = "_event_";
                /* this will filter on * .. but better do it manually in case
                else if(options.type_filter_out === "" || options.type_filter_out === 0)
                    options.type_filter_out = "*";*/

                for (var iK=0; iK<nSlots; iK++){
                    var opt = document.createElement('option');
                    opt.value = aSlots[iK];
                    opt.innerHTML = aSlots[iK];
                    selOut.appendChild(opt);
                    if(options.type_filter_out !==false && (options.type_filter_out+"").toLowerCase() == (aSlots[iK]+"").toLowerCase()){
                        //selOut.selectedIndex ..
                        opt.selected = true;
                    }
                }
                selOut.addEventListener("change",function(){
                    refreshHelper();
                });
            }
        }

        //compute best position
        var rect = root_document.getBoundingClientRect();

        // var left = ( event ? event.clientX : (rect.left + rect.width * 0.5) ) - 80;
        // var top = ( event ? event.clientY : (rect.top + rect.height * 0.5) ) - 20;
        var left = ( event ? event.clientX - rect.left: (rect.left + rect.width * 0.5) );
        left = left < 0 ? 0 : left;
        // left = left + dialogWidth > rect.width ? rect.width - dialogWdith: left;
        var top = ( event ? event.clientY - rect.top : (rect.top + rect.height * 0.5) );
        top = top < 0 ? 0 : top;
        //top = top + dialogHeight > rect.height ? rect.height - dialogWdith: left;

        dialog.style.left = left + "px";
        dialog.style.top = top + "px";

		//To avoid out of screen problems
		if(event.layerY > (rect.height - 200))
            helper.style.maxHeight = (rect.height - event.layerY - 20) + "px";

        input.focus();
        if (options.show_all_on_open) refreshHelper();

        function select(name) {
            if (name) {
                if (that.onSearchBoxSelection) {
                    that.onSearchBoxSelection(name, event, graphcanvas);
                } else {
                    var extra = LiteGraph.searchbox_extras[name.toLowerCase()];
                    if (extra) {
                        name = extra.type;
                    }

					graphcanvas.graph.beforeChange();
                    var node = LiteGraph.createNode(name);
                    if (node) {
                        node.pos = graphcanvas.convertEventToCanvasOffset(
                            event
                        );
                        graphcanvas.graph.add(node, false);
                    }

                    if (extra && extra.data) {
                        if (extra.data.properties) {
                            for (var i in extra.data.properties) {
                                node.addProperty( i, extra.data.properties[i] );
                            }
                        }
                        if (extra.data.inputs) {
                            node.inputs = [];
                            for (var i in extra.data.inputs) {
                                node.addOutput(
                                    extra.data.inputs[i][0],
                                    extra.data.inputs[i][1]
                                );
                            }
                        }
                        if (extra.data.outputs) {
                            node.outputs = [];
                            for (var i in extra.data.outputs) {
                                node.addOutput(
                                    extra.data.outputs[i][0],
                                    extra.data.outputs[i][1]
                                );
                            }
                        }
                        if (extra.data.title) {
                            node.title = extra.data.title;
                        }
                        if (extra.data.json) {
                            node.configure(extra.data.json);
                        }

                    }

                    // join node after inserting
                    if (options.node_from){
                        var iS = false;
                        switch (typeof options.slot_from){
                            case "string":
                                iS = options.node_from.findOutputSlot(options.slot_from);
                            break;
                            case "object":
                                if (options.slot_from.name){
                                    iS = options.node_from.findOutputSlot(options.slot_from.name);
                                }else{
                                    iS = -1;
                                }
                                if (iS==-1 && typeof options.slot_from.slot_index !== "undefined") iS = options.slot_from.slot_index;
                            break;
                            case "number":
                                iS = options.slot_from;
                            break;
                            default:
                                iS = 0; // try with first if no name set
                        }
                        if (typeof options.node_from.outputs[iS] !== undefined){
                            if (iS!==false && iS>-1){
                                options.node_from.connectByType( iS, node, options.node_from.outputs[iS].type );
                            }
                        }else{
                            // console.warn("cant find slot " + options.slot_from);
                        }
                    }
                    if (options.node_to){
                        var iS = false;
                        switch (typeof options.slot_from){
                            case "string":
                                iS = options.node_to.findInputSlot(options.slot_from);
                            break;
                            case "object":
                                if (options.slot_from.name){
                                    iS = options.node_to.findInputSlot(options.slot_from.name);
                                }else{
                                    iS = -1;
                                }
                                if (iS==-1 && typeof options.slot_from.slot_index !== "undefined") iS = options.slot_from.slot_index;
                            break;
                            case "number":
                                iS = options.slot_from;
                            break;
                            default:
                                iS = 0; // try with first if no name set
                        }
                        if (typeof options.node_to.inputs[iS] !== undefined){
                            if (iS!==false && iS>-1){
                                // try connection
                                options.node_to.connectByTypeOutput(iS,node,options.node_to.inputs[iS].type);
                            }
                        }else{
                            // console.warn("cant find slot_nodeTO " + options.slot_from);
                        }
                    }

                    graphcanvas.graph.afterChange();
                }
            }

            dialog.close();
        }

        function changeSelection(forward) {
            var prev = selected;
            if (selected) {
                selected.classList.remove("selected");
            }
            if (!selected) {
                selected = forward
                    ? helper.childNodes[0]
                    : helper.childNodes[helper.childNodes.length];
            } else {
                selected = forward
                    ? selected.nextSibling
                    : selected.previousSibling;
                if (!selected) {
                    selected = prev;
                }
            }
            if (!selected) {
                return;
            }
            selected.classList.add("selected");
            selected.scrollIntoView({block: "end", behavior: "smooth"});
        }

        function refreshHelper() {
            timeout = null;
            var str = input.value;
            first = null;
            helper.innerHTML = "";
            if (!str && !options.show_all_if_empty) {
                return;
            }

            if (that.onSearchBox) {
                var list = that.onSearchBox(helper, str, graphcanvas);
                if (list) {
                    for (var i = 0; i < list.length; ++i) {
                        addResult(list[i]);
                    }
                }
            } else {
                var c = 0;
                str = str.toLowerCase();
				var filter = graphcanvas.filter || graphcanvas.graph.filter;

                // filter by type preprocess
                if(options.do_type_filter && that.search_box){
                    var sIn = that.search_box.querySelector(".slot_in_type_filter");
                    var sOut = that.search_box.querySelector(".slot_out_type_filter");
                }else{
                    var sIn = false;
                    var sOut = false;
                }

                //extras
                for (var i in LiteGraph.searchbox_extras) {
                    var extra = LiteGraph.searchbox_extras[i];
                    if ((!options.show_all_if_empty || str) && extra.desc.toLowerCase().indexOf(str) === -1) {
                        continue;
                    }
					var ctor = LiteGraph.registered_node_types[ extra.type ];
					if( ctor && ctor.filter != filter )
						continue;
                    if( ! inner_test_filter(extra.type) )
                        continue;
                    addResult( extra.desc, "searchbox_extra" );
                    if ( LGraphCanvas.search_limit !== -1 && c++ > LGraphCanvas.search_limit ) {
                        break;
                    }
                }

				var filtered = null;
                if (Array.prototype.filter) { //filter supported
                    var keys = Object.keys( LiteGraph.registered_node_types ); //types
                    var filtered = keys.filter( inner_test_filter );
                } else {
					filtered = [];
                    for (var i in LiteGraph.registered_node_types) {
						if( inner_test_filter(i) )
							filtered.push(i);
                    }
                }

				for (var i = 0; i < filtered.length; i++) {
					addResult(filtered[i]);
					if ( LGraphCanvas.search_limit !== -1 && c++ > LGraphCanvas.search_limit ) {
						break;
					}
				}

                // add general type if filtering
                if (options.show_general_after_typefiltered
                    && (sIn.value || sOut.value)
                ){
                    filtered_extra = [];
                    for (var i in LiteGraph.registered_node_types) {
						if( inner_test_filter(i, {inTypeOverride: sIn&&sIn.value?"*":false, outTypeOverride: sOut&&sOut.value?"*":false}) )
							filtered_extra.push(i);
                    }
                    for (var i = 0; i < filtered_extra.length; i++) {
                        addResult(filtered_extra[i], "generic_type");
                        if ( LGraphCanvas.search_limit !== -1 && c++ > LGraphCanvas.search_limit ) {
                            break;
                        }
                    }
                }

                // check il filtering gave no results
                if ((sIn.value || sOut.value) &&
                    ( (helper.childNodes.length == 0 && options.show_general_if_none_on_typefilter) )
                ){
                    filtered_extra = [];
                    for (var i in LiteGraph.registered_node_types) {
						if( inner_test_filter(i, {skipFilter: true}) )
							filtered_extra.push(i);
                    }
                    for (var i = 0; i < filtered_extra.length; i++) {
                        addResult(filtered_extra[i], "not_in_filter");
                        if ( LGraphCanvas.search_limit !== -1 && c++ > LGraphCanvas.search_limit ) {
                            break;
                        }
                    }
                }

				function inner_test_filter( type, optsIn )
				{
                    var optsIn = optsIn || {};
                    var optsDef = { skipFilter: false
                                    ,inTypeOverride: false
                                    ,outTypeOverride: false
                                  };
                    var opts = Object.assign(optsDef,optsIn);
					var ctor = LiteGraph.registered_node_types[ type ];
					if(filter && ctor.filter != filter )
						return false;
                    if ((!options.show_all_if_empty || str) && type.toLowerCase().indexOf(str) === -1)
                        return false;

                    // filter by slot IN, OUT types
                    if(options.do_type_filter && !opts.skipFilter){
                        var sType = type;

                        var sV = sIn.value;
                        if (opts.inTypeOverride!==false) sV = opts.inTypeOverride;
						//if (sV.toLowerCase() == "_event_") sV = LiteGraph.EVENT; // -1

                        if(sIn && sV){
                            //console.log("will check filter against "+sV);
                            if (LiteGraph.registered_slot_in_types[sV] && LiteGraph.registered_slot_in_types[sV].nodes){ // type is stored
                                //console.debug("check "+sType+" in "+LiteGraph.registered_slot_in_types[sV].nodes);
                                var doesInc = LiteGraph.registered_slot_in_types[sV].nodes.includes(sType);
                                if (doesInc!==false){
                                    //console.log(sType+" HAS "+sV);
                                }else{
                                    /*console.debug(LiteGraph.registered_slot_in_types[sV]);
                                    console.log(+" DONT includes "+type);*/
                                    return false;
                                }
                            }
                        }

                        var sV = sOut.value;
                        if (opts.outTypeOverride!==false) sV = opts.outTypeOverride;
                        //if (sV.toLowerCase() == "_event_") sV = LiteGraph.EVENT; // -1

                        if(sOut && sV){
                            //console.log("search will check filter against "+sV);
                            if (LiteGraph.registered_slot_out_types[sV] && LiteGraph.registered_slot_out_types[sV].nodes){ // type is stored
                                //console.debug("check "+sType+" in "+LiteGraph.registered_slot_out_types[sV].nodes);
                                var doesInc = LiteGraph.registered_slot_out_types[sV].nodes.includes(sType);
                                if (doesInc!==false){
                                    //console.log(sType+" HAS "+sV);
                                }else{
                                    /*console.debug(LiteGraph.registered_slot_out_types[sV]);
                                    console.log(+" DONT includes "+type);*/
                                    return false;
                                }
                            }
                        }
                    }
                    return true;
				}
            }

            function addResult(type, className) {
                var help = document.createElement("div");
                if (!first) {
                    first = type;
                }
                help.innerText = type;
                help.dataset["type"] = escape(type);
                help.className = "litegraph lite-search-item";
                if (className) {
                    help.className += " " + className;
                }
                help.addEventListener("click", function(e) {
                    select(unescape(this.dataset["type"]));
                });
                helper.appendChild(help);
            }
        }

        return dialog;
    };

    LGraphCanvas.prototype.showEditPropertyValue = function( node, property, options ) {
        if (!node || node.properties[property] === undefined) {
            return;
        }

        options = options || {};
        var that = this;

        var info = node.getPropertyInfo(property);
		var type = info.type;

        var input_html = "";

        if (type == "string" || type == "number" || type == "array" || type == "object") {
            input_html = "<input autofocus type='text' class='value'/>";
        } else if ( (type == "enum" || type == "combo") && info.values) {
            input_html = "<select autofocus type='text' class='value'>";
            for (var i in info.values) {
                var v = i;
				if( info.values.constructor === Array )
					v = info.values[i];

                input_html +=
                    "<option value='" +
                    v +
                    "' " +
                    (v == node.properties[property] ? "selected" : "") +
                    ">" +
                    info.values[i] +
                    "</option>";
            }
            input_html += "</select>";
        } else if (type == "boolean" || type == "toggle") {
            input_html =
                "<input autofocus type='checkbox' class='value' " +
                (node.properties[property] ? "checked" : "") +
                "/>";
        } else {
            console.warn("unknown type: " + type);
            return;
        }

        var dialog = this.createDialog(
            "<span class='name'>" +
                (info.label ? info.label : property) +
                "</span>" +
                input_html +
                "<button>OK</button>",
            options
        );

        var input = false;
        if ((type == "enum" || type == "combo") && info.values) {
            input = dialog.querySelector("select");
            input.addEventListener("change", function(e) {
                dialog.modified();
                setValue(e.target.value);
                //var index = e.target.value;
                //setValue( e.options[e.selectedIndex].value );
            });
        } else if (type == "boolean" || type == "toggle") {
            input = dialog.querySelector("input");
            if (input) {
                input.addEventListener("click", function(e) {
                    dialog.modified();
                    setValue(!!input.checked);
                });
            }
        } else {
            input = dialog.querySelector("input");
            if (input) {
                input.addEventListener("blur", function(e) {
                    this.focus();
                });

				var v = node.properties[property] !== undefined ? node.properties[property] : "";
				if (type !== 'string') {
                    v = JSON.stringify(v);
                }

                input.value = v;
                input.addEventListener("keydown", function(e) {
                    if (e.keyCode == 27) {
                        //ESC
                        dialog.close();
                    } else if (e.keyCode == 13) {
                        // ENTER
                        inner(); // save
                    } else if (e.keyCode != 13) {
                        dialog.modified();
                        return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                });
            }
        }
        if (input) input.focus();

        var button = dialog.querySelector("button");
        button.addEventListener("click", inner);

        function inner() {
            setValue(input.value);
        }

        function setValue(value) {

			if(info && info.values && info.values.constructor === Object && info.values[value] != undefined )
				value = info.values[value];

            if (typeof node.properties[property] == "number") {
                value = Number(value);
            }
            if (type == "array" || type == "object") {
                value = JSON.parse(value);
            }
            node.properties[property] = value;
            if (node.graph) {
                node.graph._version++;
            }
            if (node.onPropertyChanged) {
                node.onPropertyChanged(property, value);
            }
			if(options.onclose)
				options.onclose();
            dialog.close();
            node.setDirtyCanvas(true, true);
        }

		return dialog;
    };

    // TODO refactor, theer are different dialog, some uses createDialog, some dont
    LGraphCanvas.prototype.createDialog = function(html, options) {
        def_options = { checkForInput: false, closeOnLeave: true, closeOnLeave_checkModified: true };
        options = Object.assign(def_options, options || {});

        var dialog = document.createElement("div");
        dialog.className = "graphdialog";
        dialog.innerHTML = html;
        dialog.is_modified = false;

        var rect = this.canvas.getBoundingClientRect();
        var offsetx = -20;
        var offsety = -20;
        if (rect) {
            offsetx -= rect.left;
            offsety -= rect.top;
        }

        if (options.position) {
            offsetx += options.position[0];
            offsety += options.position[1];
        } else if (options.event) {
            offsetx += options.event.clientX;
            offsety += options.event.clientY;
        } //centered
        else {
            offsetx += this.canvas.width * 0.5;
            offsety += this.canvas.height * 0.5;
        }

        dialog.style.left = offsetx + "px";
        dialog.style.top = offsety + "px";

        this.canvas.parentNode.appendChild(dialog);

        // acheck for input and use default behaviour: save on enter, close on esc
        if (options.checkForInput){
            var aI = [];
            var focused = false;
            if (aI = dialog.querySelectorAll("input")){
                aI.forEach(function(iX) {
                    iX.addEventListener("keydown",function(e){
                        dialog.modified();
                        if (e.keyCode == 27) {
                            dialog.close();
                        } else if (e.keyCode != 13) {
                            return;
                        }
                        // set value ?
                        e.preventDefault();
                        e.stopPropagation();
                    });
                    if (!focused) iX.focus();
                });
            }
        }

        dialog.modified = function(){
            dialog.is_modified = true;
        }
        dialog.close = function() {
            if (dialog.parentNode) {
                dialog.parentNode.removeChild(dialog);
            }
        };

        var dialogCloseTimer = null;
        var prevent_timeout = false;
        dialog.addEventListener("mouseleave", function(e) {
            if (prevent_timeout)
                return;
            if(options.closeOnLeave || LiteGraph.dialog_close_on_mouse_leave)
                if (!dialog.is_modified && LiteGraph.dialog_close_on_mouse_leave)
                    dialogCloseTimer = setTimeout(dialog.close, LiteGraph.dialog_close_on_mouse_leave_delay); //dialog.close();
        });
        dialog.addEventListener("mouseenter", function(e) {
            if(options.closeOnLeave || LiteGraph.dialog_close_on_mouse_leave)
                if(dialogCloseTimer) clearTimeout(dialogCloseTimer);
        });
        var selInDia = dialog.querySelectorAll("select");
        if (selInDia){
            // if filtering, check focus changed to comboboxes and prevent closing
            selInDia.forEach(function(selIn) {
                selIn.addEventListener("click", function(e) {
                    prevent_timeout++;
                });
                selIn.addEventListener("blur", function(e) {
                   prevent_timeout = 0;
                });
                selIn.addEventListener("change", function(e) {
                    prevent_timeout = -1;
                });
            });
        }

        return dialog;
    };

	LGraphCanvas.prototype.createPanel = function(title, options) {
		options = options || {};

		var ref_window = options.window || window;
		var root = document.createElement("div");
		root.className = "litegraph dialog";
		root.innerHTML = "<div class='dialog-header'><span class='dialog-title'></span></div><div class='dialog-content'></div><div style='display:none;' class='dialog-alt-content'></div><div class='dialog-footer'></div>";
		root.header = root.querySelector(".dialog-header");

		if(options.width)
			root.style.width = options.width + (options.width.constructor === Number ? "px" : "");
		if(options.height)
			root.style.height = options.height + (options.height.constructor === Number ? "px" : "");
		if(options.closable)
		{
			var close = document.createElement("span");
			close.innerHTML = "&#10005;";
			close.classList.add("close");
			close.addEventListener("click",function(){
				root.close();
			});
			root.header.appendChild(close);
		}
		root.title_element = root.querySelector(".dialog-title");
		root.title_element.innerText = title;
		root.content = root.querySelector(".dialog-content");
        root.alt_content = root.querySelector(".dialog-alt-content");
		root.footer = root.querySelector(".dialog-footer");

		root.close = function()
		{
		    if (root.onClose && typeof root.onClose == "function"){
		        root.onClose();
		    }
		    root.parentNode.removeChild(root);
		    /* XXX CHECK THIS */
		    if(this.parentNode){
		    	this.parentNode.removeChild(this);
		    }
		    /* XXX this was not working, was fixed with an IF, check this */
		}

        // function to swap panel content
        root.toggleAltContent = function(force){
            if (typeof force != "undefined"){
                var vTo = force ? "block" : "none";
                var vAlt = force ? "none" : "block";
            }else{
                var vTo = root.alt_content.style.display != "block" ? "block" : "none";
                var vAlt = root.alt_content.style.display != "block" ? "none" : "block";
            }
            root.alt_content.style.display = vTo;
            root.content.style.display = vAlt;
        }

        root.toggleFooterVisibility = function(force){
            if (typeof force != "undefined"){
                var vTo = force ? "block" : "none";
            }else{
                var vTo = root.footer.style.display != "block" ? "block" : "none";
            }
            root.footer.style.display = vTo;
        }

		root.clear = function()
		{
			this.content.innerHTML = "";
		}

		root.addHTML = function(code, classname, on_footer)
		{
			var elem = document.createElement("div");
			if(classname)
				elem.className = classname;
			elem.innerHTML = code;
			if(on_footer)
				root.footer.appendChild(elem);
			else
				root.content.appendChild(elem);
			return elem;
		}

		root.addButton = function( name, callback, options )
		{
			var elem = document.createElement("button");
			elem.innerText = name;
			elem.options = options;
			elem.classList.add("btn");
			elem.addEventListener("click",callback);
			root.footer.appendChild(elem);
			return elem;
		}

		root.addSeparator = function()
		{
			var elem = document.createElement("div");
			elem.className = "separator";
			root.content.appendChild(elem);
		}

		root.addWidget = function( type, name, value, options, callback )
		{
			options = options || {};
			var str_value = String(value);
			type = type.toLowerCase();
			if(type == "number")
				str_value = value.toFixed(3);

			var elem = document.createElement("div");
			elem.className = "property";
			elem.innerHTML = "<span class='property_name'></span><span class='property_value'></span>";
			elem.querySelector(".property_name").innerText = options.label || name;
			var value_element = elem.querySelector(".property_value");
			value_element.innerText = str_value;
			elem.dataset["property"] = name;
			elem.dataset["type"] = options.type || type;
			elem.options = options;
			elem.value = value;

			if( type == "code" )
				elem.addEventListener("click", function(e){ root.inner_showCodePad( this.dataset["property"] ); });
			else if (type == "boolean")
			{
				elem.classList.add("boolean");
				if(value)
					elem.classList.add("bool-on");
				elem.addEventListener("click", function(){
					//var v = node.properties[this.dataset["property"]];
					//node.setProperty(this.dataset["property"],!v); this.innerText = v ? "true" : "false";
					var propname = this.dataset["property"];
					this.value = !this.value;
					this.classList.toggle("bool-on");
					this.querySelector(".property_value").innerText = this.value ? "true" : "false";
					innerChange(propname, this.value );
				});
			}
			else if (type == "string" || type == "number")
			{
				value_element.setAttribute("contenteditable",true);
				value_element.addEventListener("keydown", function(e){
					if(e.code == "Enter" && (type != "string" || !e.shiftKey)) // allow for multiline
					{
						e.preventDefault();
						this.blur();
					}
				});
				value_element.addEventListener("blur", function(){
					var v = this.innerText;
					var propname = this.parentNode.dataset["property"];
					var proptype = this.parentNode.dataset["type"];
					if( proptype == "number")
						v = Number(v);
					innerChange(propname, v);
				});
			}
			else if (type == "enum" || type == "combo") {
				var str_value = LGraphCanvas.getPropertyPrintableValue( value, options.values );
				value_element.innerText = str_value;

				value_element.addEventListener("click", function(event){
					var values = options.values || [];
					var propname = this.parentNode.dataset["property"];
					var elem_that = this;
					var menu = new LiteGraph.ContextMenu(values,{
							event: event,
							className: "dark",
							callback: inner_clicked
						},
						ref_window);
					function inner_clicked(v, option, event) {
						//node.setProperty(propname,v);
						//graphcanvas.dirty_canvas = true;
						elem_that.innerText = v;
						innerChange(propname,v);
						return false;
					}
				});
            }

			root.content.appendChild(elem);

			function innerChange(name, value)
			{
				//console.log("change",name,value);
				//that.dirty_canvas = true;
				if(options.callback)
					options.callback(name,value,options);
				if(callback)
					callback(name,value,options);
			}

			return elem;
		}

        if (root.onOpen && typeof root.onOpen == "function") root.onOpen();

		return root;
	};

	LGraphCanvas.getPropertyPrintableValue = function(value, values)
	{
		if(!values)
			return String(value);

		if(values.constructor === Array)
		{
			return String(value);
		}

		if(values.constructor === Object)
		{
			var desc_value = "";
			for(var k in values)
			{
				if(values[k] != value)
					continue;
				desc_value = k;
				break;
			}
			return String(value) + " ("+desc_value+")";
		}
	}

    LGraphCanvas.prototype.closePanels = function(){
        var panel = document.querySelector("#node-panel");
		if(panel)
			panel.close();
        var panel = document.querySelector("#option-panel");
		if(panel)
			panel.close();
    }

    LGraphCanvas.prototype.showShowGraphOptionsPanel = function(refOpts, obEv, refMenu, refMenu2){
        if(this.constructor && this.constructor.name == "HTMLDivElement"){
            // assume coming from the menu event click
            if (!obEv || !obEv.event || !obEv.event.target || !obEv.event.target.lgraphcanvas){
                console.warn("Canvas not found"); // need a ref to canvas obj
                /*console.debug(event);
                console.debug(event.target);*/
                return;
            }
            var graphcanvas = obEv.event.target.lgraphcanvas;
        }else{
            // assume called internally
            var graphcanvas = this;
        }
        graphcanvas.closePanels();
        var ref_window = graphcanvas.getCanvasWindow();
        panel = graphcanvas.createPanel("Options",{
                                            closable: true
                                            ,window: ref_window
                                            ,onOpen: function(){
                                                graphcanvas.OPTIONPANEL_IS_OPEN = true;
                                            }
                                            ,onClose: function(){
                                                graphcanvas.OPTIONPANEL_IS_OPEN = false;
                                                graphcanvas.options_panel = null;
                                            }
                                        });
        graphcanvas.options_panel = panel;
        panel.id = "option-panel";
		panel.classList.add("settings");

        function inner_refresh(){

            panel.content.innerHTML = ""; //clear

            var fUpdate = function(name, value, options){
                switch(name){
                    default:
                        //console.debug("want to update graph options: "+name+": "+value);
                        if (options && options.key){
                            name = options.key;
                        }
                        if (options.values){
                            value = Object.values(options.values).indexOf(value);
                        }
                        //console.debug("update graph option: "+name+": "+value);
                        graphcanvas[name] = value;
                        break;
                }
            };

            // panel.addWidget( "string", "Graph name", "", {}, fUpdate); // implement

            var aProps = LiteGraph.availableCanvasOptions;
            aProps.sort();
            for(pI in aProps){
                var pX = aProps[pI];
                panel.addWidget( "boolean", pX, graphcanvas[pX], {key: pX, on: "True", off: "False"}, fUpdate);
            }

            var aLinks = [ graphcanvas.links_render_mode ];
            panel.addWidget( "combo", "Render mode", LiteGraph.LINK_RENDER_MODES[graphcanvas.links_render_mode], {key: "links_render_mode", values: LiteGraph.LINK_RENDER_MODES}, fUpdate);

            panel.addSeparator();

            panel.footer.innerHTML = ""; // clear

		}
        inner_refresh();

		graphcanvas.canvas.parentNode.appendChild( panel );
    }

    LGraphCanvas.prototype.showShowNodePanel = function( node )
	{
		this.SELECTED_NODE = node;
		this.closePanels();
		var ref_window = this.getCanvasWindow();
        var that = this;
		var graphcanvas = this;
		panel = this.createPanel(node.title || "",{
                                                    closable: true
                                                    ,window: ref_window
                                                    ,onOpen: function(){
                                                        graphcanvas.NODEPANEL_IS_OPEN = true;
                                                    }
                                                    ,onClose: function(){
                                                        graphcanvas.NODEPANEL_IS_OPEN = false;
                                                        graphcanvas.node_panel = null;
                                                    }
                                                });
        graphcanvas.node_panel = panel;
		panel.id = "node-panel";
		panel.node = node;
		panel.classList.add("settings");

		function inner_refresh()
		{
			panel.content.innerHTML = ""; //clear
			panel.addHTML("<span class='node_type'>"+node.type+"</span><span class='node_desc'>"+(node.constructor.desc || "")+"</span><span class='separator'></span>");

			panel.addHTML("<h3>Properties</h3>");

            var fUpdate = function(name,value){
                            graphcanvas.graph.beforeChange(node);
                            switch(name){
                                case "Title":
                                    node.title = value;
                                    break;
                                case "Mode":
                                    var kV = Object.values(LiteGraph.NODE_MODES).indexOf(value);
                                    if (kV>=0 && LiteGraph.NODE_MODES[kV]){
                                        node.changeMode(kV);
                                    }else{
                                        console.warn("unexpected mode: "+value);
                                    }
                                    break;
                                case "Color":
                                    if (LGraphCanvas.node_colors[value]){
                                        node.color = LGraphCanvas.node_colors[value].color;
                                        node.bgcolor = LGraphCanvas.node_colors[value].bgcolor;
                                    }else{
                                        console.warn("unexpected color: "+value);
                                    }
                                    break;
                                default:
                                    node.setProperty(name,value);
                                    break;
                            }
                            graphcanvas.graph.afterChange();
                            graphcanvas.dirty_canvas = true;
                        };

            panel.addWidget( "string", "Title", node.title, {}, fUpdate);

            panel.addWidget( "combo", "Mode", LiteGraph.NODE_MODES[node.mode], {values: LiteGraph.NODE_MODES}, fUpdate);

            var nodeCol = "";
            if (node.color !== undefined){
                nodeCol = Object.keys(LGraphCanvas.node_colors).filter(function(nK){ return LGraphCanvas.node_colors[nK].color == node.color; });
            }

            panel.addWidget( "combo", "Color", nodeCol, {values: Object.keys(LGraphCanvas.node_colors)}, fUpdate);

            for(var pName in node.properties)
			{
				var value = node.properties[pName];
				var info = node.getPropertyInfo(pName);
				var type = info.type || "string";

				//in case the user wants control over the side panel widget
				if( node.onAddPropertyToPanel && node.onAddPropertyToPanel(pName,panel) )
					continue;

				panel.addWidget( info.widget || info.type, pName, value, info, fUpdate);
			}

			panel.addSeparator();

			if(node.onShowCustomPanelInfo)
				node.onShowCustomPanelInfo(panel);

            panel.footer.innerHTML = ""; // clear
			panel.addButton("Delete",function(){
				if(node.block_delete)
					return;
				node.graph.remove(node);
				panel.close();
			}).classList.add("delete");
		}

		panel.inner_showCodePad = function( propname )
		{
            panel.classList.remove("settings");
            panel.classList.add("centered");


			/*if(window.CodeFlask) //disabled for now
			{
				panel.content.innerHTML = "<div class='code'></div>";
				var flask = new CodeFlask( "div.code", { language: 'js' });
				flask.updateCode(node.properties[propname]);
				flask.onUpdate( function(code) {
					node.setProperty(propname, code);
				});
			}
			else
			{*/
				panel.alt_content.innerHTML = "<textarea class='code'></textarea>";
				var textarea = panel.alt_content.querySelector("textarea");
                var fDoneWith = function(){
                    panel.toggleAltContent(false); //if(node_prop_div) node_prop_div.style.display = "block"; // panel.close();
                    panel.toggleFooterVisibility(true);
                    textarea.parentNode.removeChild(textarea);
                    panel.classList.add("settings");
                    panel.classList.remove("centered");
                    inner_refresh();
                }
				textarea.value = node.properties[propname];
				textarea.addEventListener("keydown", function(e){
					if(e.code == "Enter" && e.ctrlKey )
					{
						node.setProperty(propname, textarea.value);
                        fDoneWith();
					}
				});
                panel.toggleAltContent(true);
                panel.toggleFooterVisibility(false);
				textarea.style.height = "calc(100% - 40px)";
			/*}*/
			var assign = panel.addButton( "Assign", function(){
				node.setProperty(propname, textarea.value);
                fDoneWith();
			});
			panel.alt_content.appendChild(assign); //panel.content.appendChild(assign);
			var button = panel.addButton( "Close", fDoneWith);
			button.style.float = "right";
			panel.alt_content.appendChild(button); // panel.content.appendChild(button);
		}

		inner_refresh();

		this.canvas.parentNode.appendChild( panel );
	}

	LGraphCanvas.prototype.showFunctionDefinitionPropertiesDialog = function(node)
	{
		console.log("showing function definition properties dialog");

		var old_panel = this.canvas.parentNode.querySelector(".function_definition_dialog");
		if(old_panel)
			old_panel.close();

		var panel = this.createPanel("Function Definition Inputs",{closable:true, width: 500});
		panel.node = node;
		panel.classList.add("function_definition_dialog");

		function inner_refresh()
		{
			panel.clear();

			//show currents
			if(node.inputs)
				for(var i = 0; i < node.inputs.length; ++i)
				{
					var input = node.inputs[i];
					if(input.not_subgraph_input)
						continue;
					var html = "<button>&#10005;</button> <span class='bullet_icon'></span><span class='name'></span><span class='type'></span>";
					var elem = panel.addHTML(html,"function_definition_property");
					elem.dataset["name"] = input.name;
					elem.dataset["slot"] = i;
					elem.querySelector(".name").innerText = input.name;
					elem.querySelector(".type").innerText = input.type;
					elem.querySelector("button").addEventListener("click",function(e){
						node.removeInput( Number( this.parentNode.dataset["slot"] ) );
						inner_refresh();
					});
				}
		}

		//add extra
		var html = " + <span class='label'>Name</span><input class='name'/><span class='label'>Type</span><input class='type'></input><button>+</button>";
		var elem = panel.addHTML(html,"function_definition_property extra", true);
		elem.querySelector("button").addEventListener("click", function(e){
			var elem = this.parentNode;
			var name = elem.querySelector(".name").value;
			var type = elem.querySelector(".type").value;
			if(!name || node.findInputSlot(name) != -1)
				return;
			node.addInput(name,type);
			elem.querySelector(".name").value = "";
			elem.querySelector(".type").value = "";
			inner_refresh();
		});

		inner_refresh();
	    this.canvas.parentNode.appendChild(panel);
		return panel;
	}
    LGraphCanvas.prototype.showFunctionDefinitionPropertiesDialogRight = function (node) {

        // console.log("showing function definition properties dialog");
        var that = this;
        // old_panel if old_panel is exist close it
        var old_panel = this.canvas.parentNode.querySelector(".function_definition_dialog");
        if (old_panel)
            old_panel.close();
        // new panel
        var panel = this.createPanel("Function Definition Outputs", { closable: true, width: 500 });
        panel.node = node;
        panel.classList.add("function_definition_dialog");

        function inner_refresh() {
            panel.clear();
            //show currents
            if (node.outputs)
                for (var i = 0; i < node.outputs.length; ++i) {
                    var input = node.outputs[i];
                    if (input.not_subgraph_output)
                        continue;
                    var html = "<button>&#10005;</button> <span class='bullet_icon'></span><span class='name'></span><span class='type'></span>";
                    var elem = panel.addHTML(html, "function_definition_property");
                    elem.dataset["name"] = input.name;
                    elem.dataset["slot"] = i;
                    elem.querySelector(".name").innerText = input.name;
                    elem.querySelector(".type").innerText = input.type;
                    elem.querySelector("button").addEventListener("click", function (e) {
                        node.removeOutput(Number(this.parentNode.dataset["slot"]));
                        inner_refresh();
                    });
                }
        }

        //add extra
        var html = " + <span class='label'>Name</span><input class='name'/><span class='label'>Type</span><input class='type'></input><button>+</button>";
        var elem = panel.addHTML(html, "function_definition_property extra", true);
        elem.querySelector(".name").addEventListener("keydown", function (e) {
            if (e.keyCode == 13) {
                addOutput.apply(this)
            }
        })
        elem.querySelector("button").addEventListener("click", function (e) {
            addOutput.apply(this)
        });
        function addOutput() {
            var elem = this.parentNode;
            var name = elem.querySelector(".name").value;
            var type = elem.querySelector(".type").value;
            if (!name || node.findOutputSlot(name) != -1)
                return;
            node.addOutput(name, type);
            elem.querySelector(".name").value = "";
            elem.querySelector(".type").value = "";
            inner_refresh();
        }

        inner_refresh();
        this.canvas.parentNode.appendChild(panel);
        return panel;
    }
	LGraphCanvas.prototype.checkPanels = function()
	{
		if(!this.canvas)
			return;
		var panels = this.canvas.parentNode.querySelectorAll(".litegraph.dialog");
		for(var i = 0; i < panels.length; ++i)
		{
			var panel = panels[i];
			if( !panel.node )
				continue;
			if( !panel.node.graph || panel.graph != this.graph )
				panel.close();
		}
	}

    LGraphCanvas.onMenuNodeCollapse = function(value, options, e, menu, node) {
		node.graph.beforeChange(/*?*/);

		var fApplyMultiNode = function(node){
			node.collapse();
		}

		var graphcanvas = LGraphCanvas.active_canvas;
		if (!graphcanvas.selected_nodes || Object.keys(graphcanvas.selected_nodes).length <= 1){
			fApplyMultiNode(node);
		}else{
			for (var i in graphcanvas.selected_nodes) {
				fApplyMultiNode(graphcanvas.selected_nodes[i]);
			}
		}

		node.graph.afterChange(/*?*/);
    };

    LGraphCanvas.onMenuNodePin = function(value, options, e, menu, node) {
        node.pin();
    };

    LGraphCanvas.onMenuNodeMode = function(value, options, e, menu, node) {
        new LiteGraph.ContextMenu(
            LiteGraph.NODE_MODES,
            { event: e, callback: inner_clicked, parentMenu: menu, node: node }
        );

        function inner_clicked(v) {
            if (!node) {
                return;
            }
            var kV = Object.values(LiteGraph.NODE_MODES).indexOf(v);
            var fApplyMultiNode = function(node){
				if (kV>=0 && LiteGraph.NODE_MODES[kV])
					node.changeMode(kV);
				else{
					console.warn("unexpected mode: "+v);
					node.changeMode(LiteGraph.ALWAYS);
				}
			}

			var graphcanvas = LGraphCanvas.active_canvas;
			if (!graphcanvas.selected_nodes || Object.keys(graphcanvas.selected_nodes).length <= 1){
				fApplyMultiNode(node);
			}else{
				for (var i in graphcanvas.selected_nodes) {
					fApplyMultiNode(graphcanvas.selected_nodes[i]);
				}
			}
        }

        return false;
    };

    LGraphCanvas.onMenuNodeColors = function(value, options, e, menu, node) {
        if (!node) {
            throw "no node for color";
        }

        var values = [];
        values.push({
            value: null,
            content:
                "<span style='display: block; padding-left: 4px;'>No color</span>"
        });

        for (var i in LGraphCanvas.node_colors) {
            var color = LGraphCanvas.node_colors[i];
            var value = {
                value: i,
                content:
                    "<span style='display: block; color: #999; padding-left: 4px; border-left: 8px solid " +
                    color.color +
                    "; background-color:" +
                    color.bgcolor +
                    "'>" +
                    i +
                    "</span>"
            };
            values.push(value);
        }
        new LiteGraph.ContextMenu(values, {
            event: e,
            callback: inner_clicked,
            parentMenu: menu,
            node: node
        });

        function inner_clicked(v) {
            if (!node) {
                return;
            }

            var color = v.value ? LGraphCanvas.node_colors[v.value] : null;

			var fApplyColor = function(node){
				if (color) {
					if (node.constructor === LiteGraph.LGraphComment) {
						node.color = color.commentcolor;
					} else {
						node.color = color.color;
						node.bgcolor = color.bgcolor;
					}
				} else {
					delete node.color;
					delete node.bgcolor;
				}
			}

			var graphcanvas = LGraphCanvas.active_canvas;
			if (!graphcanvas.selected_nodes || Object.keys(graphcanvas.selected_nodes).length <= 1){
				fApplyColor(node);
			}else{
				for (var i in graphcanvas.selected_nodes) {
					fApplyColor(graphcanvas.selected_nodes[i]);
				}
			}
            node.setDirtyCanvas(true, true);
        }

        return false;
    };

    LGraphCanvas.onMenuNodeShapes = function(value, options, e, menu, node) {
        if (!node) {
            throw "no node passed";
        }

        new LiteGraph.ContextMenu(LiteGraph.VALID_SHAPES, {
            event: e,
            callback: inner_clicked,
            parentMenu: menu,
            node: node
        });

        function inner_clicked(v) {
            if (!node) {
                return;
            }
			node.graph.beforeChange(/*?*/); //node

			var fApplyMultiNode = function(node){
				node.shape = v;
			}

			var graphcanvas = LGraphCanvas.active_canvas;
			if (!graphcanvas.selected_nodes || Object.keys(graphcanvas.selected_nodes).length <= 1){
				fApplyMultiNode(node);
			}else{
				for (var i in graphcanvas.selected_nodes) {
					fApplyMultiNode(graphcanvas.selected_nodes[i]);
				}
			}

			node.graph.afterChange(/*?*/); //node
            node.setDirtyCanvas(true);
        }

        return false;
    };

    LGraphCanvas.onMenuNodeRemove = function(value, options, e, menu, node) {
        if (!node) {
            throw "no node passed";
        }

		var graph = node.graph;
		graph.beforeChange();


		var fApplyMultiNode = function(node){
			if (node.removable === false) {
				return;
			}
			graph.remove(node);
		}

		var graphcanvas = LGraphCanvas.active_canvas;
		if (!graphcanvas.selected_nodes || Object.keys(graphcanvas.selected_nodes).length <= 1){
			fApplyMultiNode(node);
		}else{
			for (var i in graphcanvas.selected_nodes) {
				fApplyMultiNode(graphcanvas.selected_nodes[i]);
			}
		}

		graph.afterChange();
        node.setDirtyCanvas(true, true);
    };

    LGraphCanvas.onMenuNodeToFunctionDefinition = function(value, options, e, menu, node) {
		var graph = node.graph;
		var graphcanvas = LGraphCanvas.active_canvas;
		if(!graphcanvas) //??
			return;

		var nodes_list = Object.values( graphcanvas.selected_nodes || {} );
		if( !nodes_list.length )
			nodes_list = [ node ];

		var function_definition_node = LiteGraph.createNode("graph/functionDefinition");
		function_definition_node.pos = node.pos.concat();
		graph.add(function_definition_node);

		function_definition_node.buildFromNodes( nodes_list );

		graphcanvas.deselectAllNodes();
        node.setDirtyCanvas(true, true);
    };

    LGraphCanvas.onMenuNodeClone = function(value, options, e, menu, node) {

		node.graph.beforeChange();

		var newSelected = {};

		var fApplyMultiNode = function(node){
			if (node.clonable == false) {
				return;
			}
			var newnode = node.clone();
			if (!newnode) {
				return;
			}
			newnode.pos = [node.pos[0] + 5, node.pos[1] + 5];
			node.graph.add(newnode);
			newSelected[newnode.id] = newnode;
		}

		var graphcanvas = LGraphCanvas.active_canvas;
		if (!graphcanvas.selected_nodes || Object.keys(graphcanvas.selected_nodes).length <= 1){
			fApplyMultiNode(node);
		}else{
			for (var i in graphcanvas.selected_nodes) {
				fApplyMultiNode(graphcanvas.selected_nodes[i]);
			}
		}

		if(Object.keys(newSelected).length){
			graphcanvas.selectNodes(newSelected);
		}

		node.graph.afterChange();

        node.setDirtyCanvas(true, true);
    };

    LGraphCanvas.node_colors = {
        red: { color: "#322", bgcolor: "#533", commentcolor: "#A88" },
        brown: { color: "#332922", bgcolor: "#593930", commentcolor: "#b06634" },
        green: { color: "#232", bgcolor: "#353", commentcolor: "#8A8" },
        blue: { color: "#223", bgcolor: "#335", commentcolor: "#88A" },
        pale_blue: {
            color: "#2a363b",
            bgcolor: "#3f5159",
            commentcolor: "#3f789e"
        },
        cyan: { color: "#233", bgcolor: "#355", commentcolor: "#8AA" },
        purple: { color: "#323", bgcolor: "#535", commentcolor: "#a1309b" },
        yellow: { color: "#432", bgcolor: "#653", commentcolor: "#b58b2a" },
        black: { color: "#222", bgcolor: "#000", commentcolor: "#444" }
    };

    LGraphCanvas.prototype.getCanvasMenuOptions = function() {
        var options = null;
		var that = this;
        if (this.getMenuOptions) {
            options = this.getMenuOptions();
        } else {
            options = [
                {
                    content: "Add Node",
                    has_submenu: true,
                    callback: LGraphCanvas.onMenuAdd
                },
                { content: "Add Comment", callback: LGraphCanvas.onCommentAdd },
				{ content: "Arrange", callback: LGraphCanvas.onMenuArrange },
				{ content: "Toggle Minimap", callback: LGraphCanvas.onMenuToggleMinimap}
				//{ content: "Arrange", callback: that.graph.arrange },
                //{content:"Collapse All", callback: LGraphCanvas.onMenuCollapseAll }
            ];
            /*if (LiteGraph.showCanvasOptions){
                options.push({ content: "Options", callback: that.showShowGraphOptionsPanel });
            }*/

            if (this._graph_stack && this._graph_stack.length > 0) {
                options.push(null, {
                    content: "Close function definition",
                    callback: this.closeFunctionDefinition.bind(this)
                });
            }
        }

        if (this.getExtraMenuOptions) {
            var extra = this.getExtraMenuOptions(this, options);
            if (extra) {
                options = options.concat(extra);
            }
        }

        return options;
    };

    //called by processContextMenu to extract the menu list
    LGraphCanvas.prototype.getNodeMenuOptions = function(node) {
        var options = null;

        if (node.getMenuOptions) {
            options = node.getMenuOptions(this);
        } else {
            options = [
                {
                    content: "Inputs",
                    has_submenu: true,
                    disabled: true,
                    callback: LGraphCanvas.showMenuNodeOptionalInputs
                },
                {
                    content: "Outputs",
                    has_submenu: true,
                    disabled: true,
                    callback: LGraphCanvas.showMenuNodeOptionalOutputs
                },
                null,
                {
                    content: "Properties",
                    has_submenu: true,
                    callback: LGraphCanvas.onShowMenuNodeProperties
                },
                null,
                {
                    content: "Title",
                    callback: LGraphCanvas.onShowPropertyEditor
                },
                {
                    content: "Mode",
                    has_submenu: true,
                    callback: LGraphCanvas.onMenuNodeMode
                }];
            if(node.resizable !== false){
                options.push({
                    content: "Resize", callback: LGraphCanvas.onMenuResizeNode
                });
            }
            options.push(
                {
                    content: "Collapse",
                    callback: LGraphCanvas.onMenuNodeCollapse
                },
                { content: "Pin", callback: LGraphCanvas.onMenuNodePin },
                {
                    content: "Colors",
                    has_submenu: true,
                    callback: LGraphCanvas.onMenuNodeColors
                },
                {
                    content: "Shapes",
                    has_submenu: true,
                    callback: LGraphCanvas.onMenuNodeShapes
                },
                null
            );
        }

        if (node.onGetInputs) {
            var inputs = node.onGetInputs();
            if (inputs && inputs.length) {
                options[0].disabled = false;
            }
        }

        if (node.onGetOutputs) {
            var outputs = node.onGetOutputs();
            if (outputs && outputs.length) {
                options[1].disabled = false;
            }
        }

        if (node.getExtraMenuOptions) {
            var extra = node.getExtraMenuOptions(this, options);
            if (extra) {
                extra.push(null);
                options = extra.concat(options);
            }
        }

        if (node.clonable !== false) {
            options.push({
                content: "Clone",
                callback: LGraphCanvas.onMenuNodeClone
            });
        }

		if(0) //TODO
		options.push({
			content: "To Function Definition",
			callback: LGraphCanvas.onMenuNodeToFunctionDefinition
		});

		options.push(null, {
			content: "Remove",
			disabled: !(node.removable !== false && !node.block_delete ),
			callback: LGraphCanvas.onMenuNodeRemove
		});

        if (node.graph && node.graph.onGetNodeMenuOptions) {
            node.graph.onGetNodeMenuOptions(options, node);
        }

        return options;
    };

    LGraphCanvas.prototype.getCommentMenuOptions = function(node) {
        var o = [
            { content: "Title", callback: LGraphCanvas.onShowPropertyEditor },
            {
                content: "Color",
                has_submenu: true,
                callback: LGraphCanvas.onMenuNodeColors
            },
            {
                content: "Font size",
                property: "font_size",
                type: "Number",
                callback: LGraphCanvas.onShowPropertyEditor
            },
            null,
            { content: "Remove", callback: LGraphCanvas.onMenuNodeRemove }
        ];

        return o;
    };

    LGraphCanvas.prototype.processContextMenu = function(node, event) {
        var that = this;
        var canvas = LGraphCanvas.active_canvas;
        var z_index = window.getComputedStyle(canvas.canvas.parentElement).zIndex;
        if (z_index == 'auto')
            z_index = 10;
        var ref_window = canvas.getCanvasWindow();

        var menu_info = null;
        var options = {
            event: event,
            callback: inner_option_clicked,
            extra: node
        };

		if(node)
			options.title = node.type;

        //check if mouse is in input
        var slot = null;
        if (node) {
            slot = node.getSlotInPosition(event.canvasX, event.canvasY);
            LGraphCanvas.active_node = node;
        }

        if (slot) {
            //on slot
            menu_info = [];
            if (node.getSlotMenuOptions) {
                menu_info = node.getSlotMenuOptions(slot);
            } else {
                if (
                    slot &&
                    slot.output &&
                    slot.output.links &&
                    slot.output.links.length
                ) {
                    menu_info.push({ content: "Disconnect Links", slot: slot });
                }
                var _slot = slot.input || slot.output;
                if (_slot.removable){
                	menu_info.push(
	                    _slot.locked
	                        ? "Cannot remove"
	                        : { content: "Remove Slot", slot: slot }
	                );
            	}
                if (!_slot.nameLocked){
	                menu_info.push({ content: "Rename Slot", slot: slot });
                }

            }
            options.title =
                (slot.input ? slot.input.type : slot.output.type) || "*";
            if (slot.input && slot.input.type == LiteGraph.ACTION) {
                options.title = "Action";
            }
            if (slot.output && slot.output.type == LiteGraph.EVENT) {
                options.title = "Event";
            }
        } else {
            if (node) {
                //on node
                menu_info = this.getNodeMenuOptions(node);
            } else {
                menu_info = this.getCanvasMenuOptions();
                var comment = this.graph.getCommentOnPos(
                    event.canvasX,
                    event.canvasY
                );
                if (comment) {
                    //on comment
                    menu_info.push(null, {
                        content: "Edit Comment",
                        has_submenu: true,
                        submenu: {
                            title: "Comment",
                            extra: comment,
                            options: this.getCommentMenuOptions(comment)
                        }
                    });
                }
            }
        }

        //show menu
        if (!menu_info) {
            return;
        }


        var menu = new LiteGraph.ContextMenu(menu_info, options, z_index + 1);

        function inner_option_clicked(v, options, e) {
            if (!v) {
                return;
            }

            if (v.content == "Remove Slot") {
                var info = v.slot;
                node.graph.beforeChange();
                if (info.input) {
                    node.removeInput(info.slot);
                } else if (info.output) {
                    node.removeOutput(info.slot);
                }
                node.graph.afterChange();
                return;
            } else if (v.content == "Disconnect Links") {
                var info = v.slot;
                node.graph.beforeChange();
                if (info.output) {
                    node.disconnectOutput(info.slot);
                } else if (info.input) {
                    node.disconnectInput(info.slot);
                }
                node.graph.afterChange();
                return;
            } else if (v.content == "Rename Slot") {
                var info = v.slot;
                var slot_info = info.input
                    ? node.getInputInfo(info.slot)
                    : node.getOutputInfo(info.slot);
                var dialog = that.createDialog(
                    "<span class='name'>Name</span><input autofocus type='text'/><button>OK</button>",
                    options
                );
                var input = dialog.querySelector("input");
                if (input && slot_info) {
                    input.value = slot_info.label || "";
                }
                var inner = function(){
                	node.graph.beforeChange();
                    if (input.value) {
                        if (slot_info) {
                            slot_info.label = input.value;
                        }
                        that.setDirty(true);
                    }
                    dialog.close();
                    node.graph.afterChange();
                }
                dialog.querySelector("button").addEventListener("click", inner);
                input.addEventListener("keydown", function(e) {
                    dialog.is_modified = true;
                    if (e.keyCode == 27) {
                        //ESC
                        dialog.close();
                    } else if (e.keyCode == 13) {
                        inner(); // save
                    } else if (e.keyCode != 13 && e.target.localName != "textarea") {
                        return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                });
                input.focus();
            }

            //if(v.callback)
            //	return v.callback.call(that, node, options, e, menu, that, event );
        }
    };

    //API *************************************************
    //like rect but rounded corners
    if (typeof(window) != "undefined" && window.CanvasRenderingContext2D && !window.CanvasRenderingContext2D.prototype.roundRect) {
        window.CanvasRenderingContext2D.prototype.roundRect = function(
		x,
		y,
		w,
		h,
		radius,
		radius_low
	) {
		var top_left_radius = 0;
		var top_right_radius = 0;
		var bottom_left_radius = 0;
		var bottom_right_radius = 0;

		if ( radius === 0 )
		{
			this.rect(x,y,w,h);
			return;
		}

		if(radius_low === undefined)
			radius_low = radius;

		//make it compatible with official one
		if(radius != null && radius.constructor === Array)
		{
			if(radius.length == 1)
				top_left_radius = top_right_radius = bottom_left_radius = bottom_right_radius = radius[0];
			else if(radius.length == 2)
			{
				top_left_radius = bottom_right_radius = radius[0];
				top_right_radius = bottom_left_radius = radius[1];
			}
			else if(radius.length == 4)
			{
				top_left_radius = radius[0];
				top_right_radius = radius[1];
				bottom_left_radius = radius[2];
				bottom_right_radius = radius[3];
			}
			else
				return;
		}
		else //old using numbers
		{
			top_left_radius = radius || 0;
			top_right_radius = radius || 0;
			bottom_left_radius = radius_low || 0;
			bottom_right_radius = radius_low || 0;
		}

		//top right
		this.moveTo(x + top_left_radius, y);
		this.lineTo(x + w - top_right_radius, y);
		this.quadraticCurveTo(x + w, y, x + w, y + top_right_radius);

		//bottom right
		this.lineTo(x + w, y + h - bottom_right_radius);
		this.quadraticCurveTo(
			x + w,
			y + h,
			x + w - bottom_right_radius,
			y + h
		);

		//bottom left
		this.lineTo(x + bottom_right_radius, y + h);
		this.quadraticCurveTo(x, y + h, x, y + h - bottom_left_radius);

		//top left
		this.lineTo(x, y + bottom_left_radius);
		this.quadraticCurveTo(x, y, x + top_left_radius, y);
	};
	}//if

    function compareObjects(a, b) {
        for (var i in a) {
            if (a[i] != b[i]) {
                return false;
            }
        }
        return true;
    }
    LiteGraph.compareObjects = compareObjects;

    function distance(a, b) {
        return Math.sqrt(
            (b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])
        );
    }
    LiteGraph.distance = distance;

    function colorToString(c) {
        return (
            "rgba(" +
            Math.round(c[0] * 255).toFixed() +
            "," +
            Math.round(c[1] * 255).toFixed() +
            "," +
            Math.round(c[2] * 255).toFixed() +
            "," +
            (c.length == 4 ? c[3].toFixed(2) : "1.0") +
            ")"
        );
    }
    LiteGraph.colorToString = colorToString;

    function isInsideRectangle(x, y, left, top, width, height) {
        if (left < x && left + width > x && top < y && top + height > y) {
            return true;
        }
        return false;
    }
    LiteGraph.isInsideRectangle = isInsideRectangle;

    //[minx,miny,maxx,maxy]
    function growBounding(bounding, x, y) {
        if (x < bounding[0]) {
            bounding[0] = x;
        } else if (x > bounding[2]) {
            bounding[2] = x;
        }

        if (y < bounding[1]) {
            bounding[1] = y;
        } else if (y > bounding[3]) {
            bounding[3] = y;
        }
    }
    LiteGraph.growBounding = growBounding;

    //point inside bounding box
    function isInsideBounding(p, bb) {
        if (
            p[0] < bb[0][0] ||
            p[1] < bb[0][1] ||
            p[0] > bb[1][0] ||
            p[1] > bb[1][1]
        ) {
            return false;
        }
        return true;
    }
    LiteGraph.isInsideBounding = isInsideBounding;

    //bounding overlap, format: [ startx, starty, width, height ]
    function overlapBounding(a, b) {
        var A_end_x = a[0] + a[2];
        var A_end_y = a[1] + a[3];
        var B_end_x = b[0] + b[2];
        var B_end_y = b[1] + b[3];

        if (
            a[0] > B_end_x ||
            a[1] > B_end_y ||
            A_end_x < b[0] ||
            A_end_y < b[1]
        ) {
            return false;
        }
        return true;
    }
    LiteGraph.overlapBounding = overlapBounding;

    //Convert a hex value to its decimal value - the inputted hex must be in the
    //	format of a hex triplet - the kind we use for HTML colours. The function
    //	will return an array with three values.
    function hex2num(hex) {
        if (hex.charAt(0) == "#") {
            hex = hex.slice(1);
        } //Remove the '#' char - if there is one.
        hex = hex.toUpperCase();
        var hex_alphabets = "0123456789ABCDEF";
        var value = new Array(3);
        var k = 0;
        var int1, int2;
        for (var i = 0; i < 6; i += 2) {
            int1 = hex_alphabets.indexOf(hex.charAt(i));
            int2 = hex_alphabets.indexOf(hex.charAt(i + 1));
            value[k] = int1 * 16 + int2;
            k++;
        }
        return value;
    }

    LiteGraph.hex2num = hex2num;

    //Give a array with three values as the argument and the function will return
    //	the corresponding hex triplet.
    function num2hex(triplet) {
        var hex_alphabets = "0123456789ABCDEF";
        var hex = "#";
        var int1, int2;
        for (var i = 0; i < 3; i++) {
            int1 = triplet[i] / 16;
            int2 = triplet[i] % 16;

            hex += hex_alphabets.charAt(int1) + hex_alphabets.charAt(int2);
        }
        return hex;
    }

    LiteGraph.num2hex = num2hex;

    /* LiteGraph GUI elements used for canvas editing *************************************/

    /**
     * ContextMenu from LiteGUI
     *
     * @class ContextMenu
     * @constructor
     * @param {Array} values (allows object { title: "Nice text", callback: function ... })
     * @param {Object} options [optional] Some options:\
     * - title: title to show on top of the menu
     * - callback: function to call when an option is clicked, it receives the item information
     * - ignore_item_callbacks: ignores the callback inside the item, it just calls the options.callback
     * - event: you can pass a MouseEvent, this way the ContextMenu appears in that position
     */
    function ContextMenu(values, options, z_index) {
        options = options || {};
        this.options = options;
        var that = this;

        //to link a menu with its parent
        if (options.parentMenu) {
            if (options.parentMenu.constructor !== this.constructor) {
                console.error(
                    "parentMenu must be of class ContextMenu, ignoring it"
                );
                options.parentMenu = null;
            } else {
                this.parentMenu = options.parentMenu;
                this.parentMenu.lock = true;
                this.parentMenu.current_submenu = this;
            }
        }

		var eventClass = null;
		if(options.event) //use strings because comparing classes between windows doesnt work
			eventClass = options.event.constructor.name;
        if ( eventClass !== "MouseEvent" &&
            eventClass !== "CustomEvent" &&
			eventClass !== "PointerEvent"
        ) {
            console.error(
                "Event passed to ContextMenu is not of type MouseEvent or CustomEvent. Ignoring it. ("+eventClass+")"
            );
            options.event = null;
        }

        var root = document.createElement("div");
        root.className = "litegraph litecontextmenu litemenubar-panel";
        // root.style.zIndex = z_index;
        if (options.className) {
            root.className += " " + options.className;
        }
        root.style.minWidth = 100;
        root.style.minHeight = 100;
        root.style.zIndex = 101;
        root.style.pointerEvents = "none";
        setTimeout(function() {
            root.style.pointerEvents = "auto";
        }, 100); //delay so the mouse up event is not caught by this element

        //this prevents the default context browser menu to open in case this menu was created when pressing right button
		LiteGraph.pointerListenerAdd(root,"up",
            function(e) {
			  	//console.log("pointerevents: ContextMenu up root prevent");
                e.preventDefault();
                return true;
            },
            true
        );
        root.addEventListener(
            "contextmenu",
            function(e) {
                if (e.button != 2) {
                    //right button
                    return false;
                }
                e.preventDefault();
                return false;
            },
            true
        );

        LiteGraph.pointerListenerAdd(root,"down",
            function(e) {
			  	//console.log("pointerevents: ContextMenu down");
                if (e.button == 2) {
                    that.close();
                    e.preventDefault();
                    return true;
                }
            },
            true
        );

        function on_mouse_wheel(e) {
            var pos = parseInt(root.style.top);
            root.style.top =
                (pos + e.deltaY * options.scroll_speed).toFixed() + "px";
            e.preventDefault();
            return true;
        }

        if (!options.scroll_speed) {
            options.scroll_speed = 0.1;
        }

        root.addEventListener("wheel", on_mouse_wheel, true);
        root.addEventListener("mousewheel", on_mouse_wheel, true);

        this.root = root;

        //title
        if (options.title) {
            var element = document.createElement("div");
            element.className = "litemenu-title";
            element.innerHTML = options.title;
            root.appendChild(element);
        }

        //entries
        var num = 0;
        for (var i=0; i < values.length; i++) {
            var name = values.constructor == Array ? values[i] : i;
            if (name != null && name.constructor !== String) {
                name = name.content === undefined ? String(name) : name.content;
            }
            var value = values[i];
            this.addItem(name, value, options);
            num++;
        }

		LiteGraph.pointerListenerAdd(root,"enter", function(e) {
		  	//console.log("pointerevents: ContextMenu enter");
            if (root.closing_timer) {
                clearTimeout(root.closing_timer);
            }
        });

        //insert before checking position
        var root_document = document;
        if (options.event) {
            root_document = options.event.target.ownerDocument;
        }

        if (!root_document) {
            root_document = document;
        }

		if( root_document.fullscreenElement )
	        root_document.fullscreenElement.appendChild(root);
		else
		    root_document.body.appendChild(root);

        //compute best position
        var left = options.left || 0;
        var top = options.top || 0;

        if (options.event) {
            left = options.event.clientX - 10;
            top = options.event.clientY - 10;
            if (options.title) {
                top -= 20;
            }

            if (options.parentMenu) {
                var rect = options.parentMenu.root.getBoundingClientRect();
                left = rect.left + rect.width;
            }

            var body_rect = document.body.getBoundingClientRect();
            var root_rect = root.getBoundingClientRect();

            var canvas = LGraphCanvas.active_canvas.canvas;
            //make sure the contxt menu doesn't go to the right of the canvas
            body_rect.width = canvas.getBoundingClientRect().right - body_rect.left;

            if(body_rect.height == 0)
				console.error("document.body height is 0. That is dangerous, set html,body { height: 100%; }");

            if (body_rect.width && left > body_rect.width - root_rect.width - 10) {
                left = body_rect.width - root_rect.width - 10;
            }
            if (body_rect.height && top > body_rect.height - root_rect.height - 10) {
                top = body_rect.height - root_rect.height - 10;
            }
        }

        root.style.left = left + "px";
        root.style.top = top + "px";

        if (options.scale) {
            root.style.transform = "scale(" + options.scale + ")";
        }

    }

    ContextMenu.prototype.addItem = function(name, value, options) {
        var that = this;
        options = options || {};

        var element = document.createElement("div");
        element.className = "litemenu-entry submenu";

        var disabled = false;

        if (value === null) {
            element.classList.add("separator");
            //element.innerHTML = "<hr/>"
            //continue;
        } else {
            element.innerHTML = value && value.title ? value.title : name;
            element.value = value;

            if (value) {
                if (value.disabled) {
                    disabled = true;
                    element.classList.add("disabled");
                }
                if (value.submenu || value.has_submenu) {
                    element.classList.add("has_submenu");
                }
            }

            if (typeof value == "function") {
                element.dataset["value"] = name;
                element.onclick_callback = value;
            } else {
                element.dataset["value"] = value;
            }

            if (value.className) {
                element.className += " " + value.className;
            }
        }

        this.root.appendChild(element);
        if (!disabled) {
            element.addEventListener("click", inner_onclick);
        }
        if (options.autoopen) {
			LiteGraph.pointerListenerAdd(element,"enter",inner_over);
        }

        function inner_over(e) {
            var value = this.value;
            if (!value || !value.has_submenu) {
                return;
            }
            //if it is a submenu, autoopen like the item was clicked
            inner_onclick.call(this, e);
        }

        //menu option clicked
        function inner_onclick(e) {
            var value = this.value;
            var close_parent = true;

            if (that.current_submenu) {
                that.current_submenu.close(e);
            }

            //global callback
            if (options.callback) {
                var r = options.callback.call(
                    this,
                    value,
                    options,
                    e,
                    that,
                    options.node
                );
                if (r === true) {
                    close_parent = false;
                }
            }

            //special cases
            if (value) {
                if (
                    value.callback &&
                    !options.ignore_item_callbacks &&
                    value.disabled !== true
                ) {
                    //item callback
                    var r = value.callback.call(
                        this,
                        value,
                        options,
                        e,
                        that,
                        options.extra
                    );
                    if (r === true) {
                        close_parent = false;
                    }
                }
                if (value.submenu) {
                    if (!value.submenu.options) {
                        throw "ContextMenu submenu needs options";
                    }
                    var submenu = new that.constructor(value.submenu.options, {
                        callback: value.submenu.callback,
                        event: e,
                        parentMenu: that,
                        ignore_item_callbacks:
                            value.submenu.ignore_item_callbacks,
                        title: value.submenu.title,
                        extra: value.submenu.extra,
                        autoopen: options.autoopen
                    });
                    close_parent = false;
                }
            }

            if (close_parent && !that.lock) {
                that.close();
            }
        }

        return element;
    };

    ContextMenu.prototype.close = function(e, ignore_parent_menu) {
        if (this.root.parentNode) {
            this.root.parentNode.removeChild(this.root);
        }
        if (this.parentMenu && !ignore_parent_menu) {
            this.parentMenu.lock = false;
            this.parentMenu.current_submenu = null;
            if (e === undefined) {
                this.parentMenu.close();
            } else if (
                e &&
                !ContextMenu.isCursorOverElement(e, this.parentMenu.root)
            ) {
                ContextMenu.trigger(this.parentMenu.root, LiteGraph.pointerevents_method+"leave", e);
            }
        }
        if (this.current_submenu) {
            this.current_submenu.close(e, true);
        }

        if (this.root.closing_timer) {
            clearTimeout(this.root.closing_timer);
        }

        // TODO implement : LiteGraph.contextMenuClosed(); :: keep track of opened / closed / current ContextMenu
        // on key press, allow filtering/selecting the context menu elements
    };

    //this code is used to trigger events easily (used in the context menu mouseleave
    ContextMenu.trigger = function(element, event_name, params, origin) {
        var evt = document.createEvent("CustomEvent");
        evt.initCustomEvent(event_name, true, true, params); //canBubble, cancelable, detail
        evt.srcElement = origin;
        if (element.dispatchEvent) {
            element.dispatchEvent(evt);
        } else if (element.__events) {
            element.__events.dispatchEvent(evt);
        }
        //else nothing seems binded here so nothing to do
        return evt;
    };

    //returns the top most menu
    ContextMenu.prototype.getTopMenu = function() {
        if (this.options.parentMenu) {
            return this.options.parentMenu.getTopMenu();
        }
        return this;
    };

    ContextMenu.prototype.getFirstEvent = function() {
        if (this.options.parentMenu) {
            return this.options.parentMenu.getFirstEvent();
        }
        return this.options.event;
    };

    ContextMenu.isCursorOverElement = function(event, element) {
        var left = event.clientX;
        var top = event.clientY;
        var rect = element.getBoundingClientRect();
        if (!rect) {
            return false;
        }
        if (
            top > rect.top &&
            top < rect.top + rect.height &&
            left > rect.left &&
            left < rect.left + rect.width
        ) {
            return true;
        }
        return false;
    };

    LiteGraph.ContextMenu = ContextMenu;

    LiteGraph.closeAllContextMenus = function(ref_window) {
        ref_window = ref_window || window;

        var elements = ref_window.document.querySelectorAll(".litecontextmenu");
        if (!elements.length) {
            return;
        }

        var result = [];
        for (var i = 0; i < elements.length; i++) {
            result.push(elements[i]);
        }

        for (var i=0; i < result.length; i++) {
            if (result[i].close) {
                result[i].close();
            } else if (result[i].parentNode) {
                result[i].parentNode.removeChild(result[i]);
            }
        }
    };

    LiteGraph.extendClass = function(target, origin) {
        for (var i in origin) {
            //copy class properties
            if (target.hasOwnProperty(i)) {
                continue;
            }
            target[i] = origin[i];
        }

        if (origin.prototype) {
            //copy prototype properties
            for (var i in origin.prototype) {
                //only enumerable
                if (!origin.prototype.hasOwnProperty(i)) {
                    continue;
                }

                if (target.prototype.hasOwnProperty(i)) {
                    //avoid overwriting existing ones
                    continue;
                }

                //copy getters
                if (origin.prototype.__lookupGetter__(i)) {
                    target.prototype.__defineGetter__(
                        i,
                        origin.prototype.__lookupGetter__(i)
                    );
                } else {
                    target.prototype[i] = origin.prototype[i];
                }

                //and setters
                if (origin.prototype.__lookupSetter__(i)) {
                    target.prototype.__defineSetter__(
                        i,
                        origin.prototype.__lookupSetter__(i)
                    );
                }
            }
        }
    };

	//used by some widgets to render a curve editor
	function CurveEditor( points )
	{
		this.points = points;
		this.selected = -1;
		this.nearest = -1;
		this.size = null; //stores last size used
		this.must_update = true;
		this.margin = 5;
	}

	CurveEditor.sampleCurve = function(f,points)
	{
		if(!points)
			return;
		for(var i = 0; i < points.length - 1; ++i)
		{
			var p = points[i];
			var pn = points[i+1];
			if(pn[0] < f)
				continue;
			var r = (pn[0] - p[0]);
			if( Math.abs(r) < 0.00001 )
				return p[1];
			var local_f = (f - p[0]) / r;
			return p[1] * (1.0 - local_f) + pn[1] * local_f;
		}
		return 0;
	}

	CurveEditor.prototype.draw = function( ctx, size, graphcanvas, background_color, line_color, inactive )
	{
		var points = this.points;
		if(!points)
			return;
		this.size = size;
		var w = size[0] - this.margin * 2;
		var h = size[1] - this.margin * 2;

		line_color = line_color || "#666";

		ctx.save();
		ctx.translate(this.margin,this.margin);

		if(background_color)
		{
			ctx.fillStyle = "#111";
			ctx.fillRect(0,0,w,h);
			ctx.fillStyle = "#222";
			ctx.fillRect(w*0.5,0,1,h);
			ctx.strokeStyle = "#333";
			ctx.strokeRect(0,0,w,h);
		}
		ctx.strokeStyle = line_color;
		if(inactive)
			ctx.globalAlpha = 0.5;
		ctx.beginPath();
		for(var i = 0; i < points.length; ++i)
		{
			var p = points[i];
			ctx.lineTo( p[0] * w, (1.0 - p[1]) * h );
		}
		ctx.stroke();
		ctx.globalAlpha = 1;
		if(!inactive)
			for(var i = 0; i < points.length; ++i)
			{
				var p = points[i];
				ctx.fillStyle = this.selected == i ? "#FFF" : (this.nearest == i ? "#DDD" : "#AAA");
				ctx.beginPath();
				ctx.arc( p[0] * w, (1.0 - p[1]) * h, 2, 0, Math.PI * 2 );
				ctx.fill();
			}
		ctx.restore();
	}

	//localpos is mouse in curve editor space
	CurveEditor.prototype.onMouseDown = function( localpos, graphcanvas )
	{
		var points = this.points;
		if(!points)
			return;
		if( localpos[1] < 0 )
			return;

		var w = this.size[0] - this.margin * 2;
		var h = this.size[1] - this.margin * 2;
		var x = localpos[0] - this.margin;
		var y = localpos[1] - this.margin;
		var pos = [x,y];
		var max_dist = 30 / graphcanvas.ds.scale;
		//search closer one
		this.selected = this.getCloserPoint(pos, max_dist);
		//create one
		if(this.selected == -1)
		{
			var point = [x / w, 1 - y / h];
			points.push(point);
			points.sort(function(a,b){ return a[0] - b[0]; });
			this.selected = points.indexOf(point);
			this.must_update = true;
		}
		if(this.selected != -1)
			return true;
	}

	CurveEditor.prototype.onMouseMove = function( localpos, graphcanvas )
	{
		var points = this.points;
		if(!points)
			return;
		var s = this.selected;
		if(s < 0)
			return;
		var x = (localpos[0] - this.margin) / (this.size[0] - this.margin * 2 );
		var y = (localpos[1] - this.margin) / (this.size[1] - this.margin * 2 );
		var curvepos = [(localpos[0] - this.margin),(localpos[1] - this.margin)];
		var max_dist = 30 / graphcanvas.ds.scale;
		this._nearest = this.getCloserPoint(curvepos, max_dist);
		var point = points[s];
		if(point)
		{
			var is_edge_point = s == 0 || s == points.length - 1;
			if( !is_edge_point && (localpos[0] < -10 || localpos[0] > this.size[0] + 10 || localpos[1] < -10 || localpos[1] > this.size[1] + 10) )
			{
				points.splice(s,1);
				this.selected = -1;
				return;
			}
			if( !is_edge_point ) //not edges
				point[0] = Math.clamp(x,0,1);
			else
				point[0] = s == 0 ? 0 : 1;
			point[1] = 1.0 - Math.clamp(y,0,1);
			points.sort(function(a,b){ return a[0] - b[0]; });
			this.selected = points.indexOf(point);
			this.must_update = true;
		}
	}

	CurveEditor.prototype.onMouseUp = function( localpos, graphcanvas )
	{
		this.selected = -1;
		return false;
	}

	CurveEditor.prototype.getCloserPoint = function(pos, max_dist)
	{
		var points = this.points;
		if(!points)
			return -1;
		max_dist = max_dist || 30;
		var w = (this.size[0] - this.margin * 2);
		var h = (this.size[1] - this.margin * 2);
		var num = points.length;
		var p2 = [0,0];
		var min_dist = 1000000;
		var closest = -1;
		var last_valid = -1;
		for(var i = 0; i < num; ++i)
		{
			var p = points[i];
			p2[0] = p[0] * w;
			p2[1] = (1.0 - p[1]) * h;
			if(p2[0] < pos[0])
				last_valid = i;
			var dist = vec2.distance(pos,p2);
			if(dist > min_dist || dist > max_dist)
				continue;
			closest = i;
			min_dist = dist;
		}
		return closest;
	}

	LiteGraph.CurveEditor = CurveEditor;

    //used to create nodes from wrapping functions
    LiteGraph.getParameterNames = function(func) {
        return (func + "")
            .replace(/[/][/].*$/gm, "") // strip single-line comments
            .replace(/\s+/g, "") // strip white space
            .replace(/[/][*][^/*]*[*][/]/g, "") // strip multi-line comments  /**/
            .split("){", 1)[0]
            .replace(/^[^(]*[(]/, "") // extract the parameters
            .replace(/=[^,]+/g, "") // strip any ES6 defaults
            .split(",")
            .filter(Boolean); // split & filter [""]
    };

	/* helper for interaction: pointer, touch, mouse Listeners
	used by LGraphCanvas DragAndScale ContextMenu*/
	LiteGraph.pointerListenerAdd = function(oDOM, sEvIn, fCall, capture=false) {
		if (!oDOM || !oDOM.addEventListener || !sEvIn || typeof fCall!=="function"){
			//console.log("cant pointerListenerAdd "+oDOM+", "+sEvent+", "+fCall);
			return; // -- break --
		}

		var sMethod = LiteGraph.pointerevents_method;
		var sEvent = sEvIn;

		// UNDER CONSTRUCTION
		// convert pointerevents to touch event when not available
		if (sMethod=="pointer" && !window.PointerEvent){
			console.warn("sMethod=='pointer' && !window.PointerEvent");
			console.log("Converting pointer["+sEvent+"] : down move up cancel enter TO touchstart touchmove touchend, etc ..");
			switch(sEvent){
				case "down":{
					sMethod = "touch";
					sEvent = "start";
					break;
				}
				case "move":{
					sMethod = "touch";
					//sEvent = "move";
					break;
				}
				case "up":{
					sMethod = "touch";
					sEvent = "end";
					break;
				}
				case "cancel":{
					sMethod = "touch";
					//sEvent = "cancel";
					break;
				}
				case "enter":{
					console.log("debug: Should I send a move event?"); // ???
					break;
				}
				// case "over": case "out": not used at now
				default:{
					console.warn("PointerEvent not available in this browser ? The event "+sEvent+" would not be called");
				}
			}
		}

		switch(sEvent){
			//both pointer and move events
			case "down": case "up": case "move": case "over": case "out": case "enter":
			{
				oDOM.addEventListener(sMethod+sEvent, fCall, capture);
			}
			// only pointerevents
			case "leave": case "cancel": case "gotpointercapture": case "lostpointercapture":
			{
				if (sMethod!="mouse"){
					return oDOM.addEventListener(sMethod+sEvent, fCall, capture);
				}
			}
			// not "pointer" || "mouse"
			default:
				return oDOM.addEventListener(sEvent, fCall, capture);
		}
	}
	LiteGraph.pointerListenerRemove = function(oDOM, sEvent, fCall, capture=false) {
		if (!oDOM || !oDOM.removeEventListener || !sEvent || typeof fCall!=="function"){
			//console.log("cant pointerListenerRemove "+oDOM+", "+sEvent+", "+fCall);
			return; // -- break --
		}
		switch(sEvent){
			//both pointer and move events
			case "down": case "up": case "move": case "over": case "out": case "enter":
			{
				if (LiteGraph.pointerevents_method=="pointer" || LiteGraph.pointerevents_method=="mouse"){
					oDOM.removeEventListener(LiteGraph.pointerevents_method+sEvent, fCall, capture);
				}
			}
			// only pointerevents
			case "leave": case "cancel": case "gotpointercapture": case "lostpointercapture":
			{
				if (LiteGraph.pointerevents_method=="pointer"){
					return oDOM.removeEventListener(LiteGraph.pointerevents_method+sEvent, fCall, capture);
				}
			}
			// not "pointer" || "mouse"
			default:
				return oDOM.removeEventListener(sEvent, fCall, capture);
		}
	}

    Math.clamp = function(v, a, b) {
        return a > v ? a : b < v ? b : v;
    };

    if (typeof window != "undefined" && !window["requestAnimationFrame"]) {
        window.requestAnimationFrame =
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame ||
            function(callback) {
                window.setTimeout(callback, 1000 / 60);
            };
    }
})(this);

if (typeof exports != "undefined") {
    exports.LiteGraph = this.LiteGraph;
}

//import './nodes/scipy.js'
(function(global) {
    var LiteGraph = global.LiteGraph;

    function ImageIOImRead() {
		this.addOutput("image", "numpy.ndarray");
    }
    ImageIOImRead.title = "Image Read";
    ImageIOImRead.type = "Image.Read";
    ImageIOImRead.desc = "Reads an image from the specified file. Returns a numpy array," +
        "which comes with a dict of meta data at its ‘meta’ attribute.";
    LiteGraph.registerNodeType(ImageIOImRead.type, ImageIOImRead);

    function ImageIOImWrite() {
        this.addInput("image", "numpy.ndarray")
    }
    ImageIOImWrite.title = "Image Write";
    ImageIOImWrite.type = "Image.Write";
    ImageIOImWrite.desc = "Write an image to the specified file.";
    LiteGraph.registerNodeType(ImageIOImWrite.type, ImageIOImWrite);

    function ImageShow() {
        this.addInput("image", "numpy.ndarray")
    }
    ImageShow.title = "Image Show";
    ImageShow.type = "Image.Show";
    ImageShow.desc = "Show an image.";
    LiteGraph.registerNodeType(ImageShow.type, ImageShow);

    function ImageGaussianFilter() {
        this.addInput("input", "numpy.ndarray");
        this.addInput("sigma", "number");
        this.addOutput("output", "numpy.ndarray");
    }
    ImageGaussianFilter.title = "Gaussian Filter";
    ImageGaussianFilter.type = "Image.GaussianFilter";
    ImageGaussianFilter.desc = "Gaussian filter";
    LiteGraph.registerNodeType(ImageGaussianFilter.type, ImageGaussianFilter);
})(this);
