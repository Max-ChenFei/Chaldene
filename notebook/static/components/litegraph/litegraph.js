//packer version

//*********************************************************************************
// Renderer: multiple layers rendering using offscreen canvans
//*********************************************************************************
(function(global) {

    function deepCopy(obj) {
        if (!obj) return null;
        return JSON.parse(JSON.stringify(obj));
    }

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

    global.TypeRegistry = new TypeRegistry();
    global.Scene = Scene;
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
        Object.setPrototypeOf(node_class.prototype, Node.prototype);

        if (!node_class.title) {
            node_class.title = node_class.name;
        }
        let type = node_class.type;
        let already_registered = this.registered_node_types[type];
        if (already_registered) console.warn("replacing node type: " + type);
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
        if (!node_class)
            throw ("node type not found: " + type);
        delete this.registered_node_types[node_class.type];
    };

    /**
     * Create a node of a given type with a name. The node is not attached to any graph yet.
     * @method createNode
     * @param {String} type full name of the node class. p.e. "math.sin"
     */
    TypeRegistry.prototype.createNode = function(type_name) {
        let node_class = this.registered_node_types[type_name];
        if (!node_class) {
            console.warn("Can not create node with type ${type_name}");
            return undefined;
        };
        let node = new node_class();
        if (node.onNodeCreated) {
            node.onNodeCreated();
        }
        return node;
    };

    TypeRegistry.prototype.cloneNode = function(node) {
        if (!node)
            return;
        let cloned_node = this.createNode(node.type);
        let config = deepCopy(node.serialize());
        if (!cloned_node)
            return;
        cloned_node.configure(config);
        cloned_node.id = undefined;
        cloned_node.clearAllConnections();
        return cloned_node;
    };

    /**
     * Returns a registered node type with a given name
     * @method getNodeType
     * @param {String} name_filter full name contain the name_filter string
     * @return {Class} the node class
     */
    TypeRegistry.prototype.getNodeTypesByNameFilter = function(name_filter) {
        name_filter = name_filter ? name_filter : "";
        let node_classes = [];
        for (const node_class of Object.values(this.registered_node_types)) {
            if (node_class.name.includes(name_filter))
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

    function assertNameUniqueIn(name, obj) {
        if (!name in obj) {
            throw "Conflicts with another local variable or function parameters";
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

    Variable.prototype.serialize = function() {
        return [this.name, this.type, this.value];
    };


    //*********************************************************************************
    // LGraph CLASS
    //*********************************************************************************

    /**
     * Graph is the class that contain a full graph. We instantiate one and add nodes to it.
     * supported callbacks:
     + onNodeAdded: when a new node is added to the graph
     + onNodeRemoved: when a node inside this graph is removed
     + onNodeConnectionChange: some connection has changed in the graph (connected or disconnected)
     *
     * @class Graph
     * @constructor
     */

    function Graph() {
        this.init();
    }

    Graph.prototype.init = function() {
        this.nodes = {};
        this.connectors = {};
        this.local_vars = {};
        this.inputs = {};
        this.outputs = {};
        this.subgraphs = {};
        this.next_unique_id = 0;
    };

    Graph.prototype.serialize = function() {
        function serializeEachElementIn(list) {
            let out = [];
            for (const item of list) {
                out.push(item.serialize());
            }
            return out;
        }

        const to_serialize = ['nodes', 'connectors', 'local_vars', 'inputs', 'outputs', 'subgraphs'];
        let out = {};
        for (const t of to_serialize) {
            out[t] = serializeEachElementIn(Object.values(this[t]));
        };
        return out;
    };

    Graph.prototype.configure = function(config) {
        if (!config)
            return;
        for (const node_config of config.nodes) {
            let node = TypeRegistry.createNode(node_config.type);
            if (!node) continue;
            node.configure(config);
            this.nodes[node.id] = node;
        }
        for (const connector_config of config.connectors) {
            let connector = new Connector(connector_config[0], this.nodes[connector_config[1]], connector_config[2],
                this.nodes[connector_config[3]], connector_config[4]);
            this.connectors[connector.id] = connector;
        }
        for (const v of config.local_vars) {
            this.addLocalVar(v[0], v[1], v[2]);
        }
        for (const v of config.inputs) {
            this.addInput(v[0], v[1], v[2]);
        }
        for (const v of config.outputs) {
            this.addOutput(v[0], v[1], v[2]);
        }
        for (const v of config.subgraphs) {
            let subgraph = new Graph();
            subgraph.configure(v);
            this.addSubGraph(v.name, subgraph);
        }
    };

    Graph.prototype.getItems = function() {
        return Object.values(this.nodes).concat(Object.values(this.connectors))
    };

    function swap(a, b) {
        let tmp = a;
        a = b;
        b = tmp;
    }

    Graph.prototype.getConnector = function(from_node, from_slot_name, to_node, to_slot_name) {
        if (!from_node || !from_slot_name || !to_node || !to_slot_name) {
            console.warn("Can not get the connector of null");
        }
        if (from_slot_name.isInput()) {
            [from_node, to_node] = swap(from_node, to_node);
            [from_slot_name, to_slot_name] = swap(from_slot_name, to_slot_name);
        }
        for (const connector of Object.values(this.connectors)) {
            if (connector.out_node == from_node && connector.out_slot_name == from_slot_name &&
                connector.in_node == to_node && connector.in_slot_name == to_slot_name) {
                return connector;
            }
        }
        console.warn("Can find a connector");
        return null;
    }

    Graph.prototype.getUniqueId = function() {
        return this.next_unique_id++;
    };

    /**
     * Clear the graph
     * @method clear
     */
    Graph.prototype.clear = function() {
        for (const node of Object.values(this.nodes)) {
            if (node.onRemoved) {
                node.onRemoved();
            }
        }
        this.init();
    };


    Graph.prototype.isNodeValid = function(node) {
        if (!node) {
            console.warn("The node to be added to the graph is null");
            return false;
        }
        if (!(node instanceof Node)) {
            console.warn("The node to be added to the graph is not the instance of the Node");
            return false;
        }
        return true;
    };

    /**
     * Adds a new node instance to this graph
     * @method add
     * @param {Node} node the instance of the node
     */
    Graph.prototype.addNode = function(node) {
        if (!this.isNodeValid())
            return
        node.id = this.getUniqueId();
        this.nodes[node.id] = node;

        if (node.onAdded) {
            node.onAdded();
        }

        if (this.onNodeAdded) {
            this.onNodeAdded(node);
        }
    };

    Graph.prototype.addConnector = function(connector) {
        if (!connector) {
            console.warn("None is passed as the connector parameter");
            return;
        }
        connector.id = this.getUniqueId();
        this.connectors[connector.id] = connector;
        let out_node = connector.out_node;
        if (out_node) out_node.addConnectionOfOutput(connector.out_slot_name);
        let in_node = connector.in_node;
        if (in_node) in_node.addConnectionOfInput(connector.in_slot_name);
    };

    Graph.prototype.allOutConnectorsOf = function(node_id) {
        let out = [];
        for (const connector of Object.values(this.connectors)) {
            if (connector.out_node.id = node_id)
                out.append(connector);
        }
        return out;
    };

    Graph.prototype.removeConnector = function(connector) {
        if (!connector) {
            console.warn("The connector is not existed");
            return;
        }
        let out_node = connector.out_node;
        if (out_node) out_node.breakConnectionOfOutput(connector.out_slot_name);
        let in_node = connector.in_node;
        if (in_node) in_node.breakConnectionOfInput(connector.in_slot_name);
        delete this.connectors[connector.id];
    };

    Graph.prototype.removeConnectors = function(connectors) {
        if (connectors.constructor === Array)
            for (const connector of connectors) {
                this.removeConnector(connector);
            }
    };

    Graph.prototype.getConnectorsLinkedToNodes = function(nodes) {
        let connectors = [];
        let nodes_id = [];
        for (const node of nodes) {
            nodes_id.append(node.id);
        }
        for (const connector of Object.values(this.connectors)) {
            if (nodes_id.includes(connector.out_node.id) || nodes_id.includes(connector.in_node.id)) {
                connectors.append(connector);
            }
        }
        return connectors;
    }

    Graph.prototype.getConnectorsLinkedToSlot = function(node, slot) {
        let connectors = [];
        for (const connector of Object.values(this.connectors)) {
            let target_node_id = null;
            let target_slot_name = "";
            if (slot.isInput()) {
                target_node_id = connector.in_node.id;
                target_slot_name = connector.in_slot_name;
            } else {
                target_node_id = connector.out_node.id;
                target_slot_name = connector.out_slot_name;
            }
            if (node.id == target_node_id && slot.name == target_slot_name)
                connectors.append(connector);
        }
        return connectors;
    }

    Graph.prototype.clearConnectorsOfNode = function(node) {
        let connectors = this.getConnectorsLinkedToNodes([node]);
        this.removeConnectors(connectors);
        node.clearAllConnections();
    };

    Graph.prototype.removeNode = function(node) {
        if (!this.isNodeValid())
            return
        if (this.onNodeRemoved) {
            this.onNodeRemoved(node.id);
        }
        this.clearConnectorsOfNode(node);
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
    Graph.prototype.getNodeById = function(id) {
        if (!id) return null;
        return this.nodes[id];
    };

    Graph.prototype.addSubGraph = function(name, subgraph) {
        assertNameUniqueIn(name, this.subgraphs);
        this.subgraphs[name] = subgraph;
    };

    Graph.prototype.removeSubGraph = function(name) {
        delete this.subgraphs[name];
    };

    Graph.prototype.getSubGraph = function(name) {
        return this.subgraphs[name];
    };

    /**
     * @method add variable to objects
     * @param {String} name
     * @param {String} type
     * @param {*} value [optional]
     */
    Graph.prototype.addVarTo = function(name, type, value, obj, callback) {
        assertNameUniqueIn(name, Object.keys(this.inputs));
        assertNameUniqueIn(name, Object.keys(this.outputs));
        assertNameUniqueIn(name, Object.keys(this.local_vars));
        let v = new Variable(name, type, value);
        obj[name] = v;

        if (callback) {
            callback(v);
        }
    };

    Graph.prototype.addInput = function(name, type, value) {
        this.addVarTo(name, type, value, this.inputs, this.onInputAdded);
    };

    Graph.prototype.addOutput = function(name, type, value) {
        this.addVarTo(name, type, value, this.outputs, this.onOutputAdded);
    };

    Graph.prototype.addLocalVar = function(name, type, value) {
        this.addVarTo(name, type, value, this.local_vars);
    };

    /**
     * @method getVarValue
     * @param {String} name
     * @return {*} the value
     */
    Graph.prototype.getVarValueFrom = function(name, obj) {
        let v = obj[name];
        if (!v) return null;
        return v.getValue();
    };

    Graph.prototype.getInputValue = function(name) {
        this.getVarValueFrom(name, this.inputs)
    };

    Graph.prototype.getOutputValue = function(name) {
        this.getVarValueFrom(name, this.outputs)
    };

    Graph.prototype.getLocalVarValue = function(name) {
        this.getVarValueFrom(name, this.local_vars)
    };

    /**
     * Assign a data to the global graph variable
     * @method setGlobalInputData
     * @param {String} name
     * @param {*} data
     */
    Graph.prototype.setVarValueOf = function(name, new_value, obj) {
        let v = obj[name];
        if (!v) return;
        v.updateValue(new_value);
    };

    Graph.prototype.setInputVarValue = function(name, new_value) {
        this.setVarValueOf(name, new_value, this.inputs)
    };

    Graph.prototype.setOutputVarValue = function(name, new_value) {
        this.setVarValueOf(name, new_value, this.outputs)
    };

    Graph.prototype.setLocalVarValue = function(name, new_value) {
        this.setVarValueOf(name, new_value, this.local_vars)
    };

    /**
     * @method renameInput
     * @param {String} name
     * @param {String} new_name
     */
    Graph.prototype.renameVarOf = function(name, new_name, obj, callback) {
        if (name == new_name) return;

        let v = obj[name];
        if (!v) return;

        assertNameUniqueIn(new_name, Object.keys(this.inputs));
        v.updateName(new_name);

        obj[new_name] = obj[name];
        delete obj[new_name];

        if (callback) {
            callback(name, new_name);
        }
    };

    Graph.prototype.renameInputVar = function(name, new_name) {
        this.renameVarOf(name, new_name, this.inputs);
    };

    Graph.prototype.renameOutputVar = function(name, new_name) {
        this.renameVarOf(name, new_name, this.outputs);
    };

    Graph.prototype.renameLocalVarVar = function(name, new_name) {
        this.renameVarOf(name, new_name, this.local_vars);
    };

    /**
     * Changes the type of a variable
     * @method changeInputType
     * @param {String} name
     * @param {String} type
     */
    Graph.prototype.changeVarTypeOf = function(name, new_type, obj) {
        let v = obj[name];
        if (!v) return;
        v.updateType(new_type);
    };

    Graph.prototype.changeInputVarType = function(name, new_type) {
        this.changeVarTypeOf(name, new_type, this.inputs)
    };

    Graph.prototype.changeOutputVarType = function(name, new_type) {
        this.changeVarTypeOf(name, new_type, this.outputs)
    };

    Graph.prototype.changeLocalVarType = function(name, new_type) {
        this.changeVarTypeOf(name, new_type, this.local_vars)
    };

    /**
     * Removes a variable
     * @method removeInput
     * @param {String} name
     * @param {String} type
     */
    Graph.prototype.removeVarOf = function(name, obj) {
        let v = obj[name];
        if (!v) return;
        delete obj[name];
    };

    Graph.prototype.removeInputVar = function(name) {
        this.removeVarOf(name, this.inputs);
    };

    Graph.prototype.removeOutputVar = function(name) {
        this.removeVarOf(name, this.outputs);
    };

    Graph.prototype.removeLocalVar = function(name) {
        this.removeVarOf(name, this.local_vars);
    };


    // *************************************************************
    //   Connector CLASS                                     *******
    // *************************************************************
    /**
     * Connector links the the output node and input node
     * @method node slot class
     * @param {Number} id the unique id of this connector
     * @param {Node} out_node
     * @param {String} out_slot_name
     * @param {Node} in_node
     * @param {String} in_slot_name
     */
    function Connector(id, out_node, out_slot_name, in_node, in_slot_name) {
        this.id = id;
        this.out_node = out_node;
        this.out_slot_name = out_slot_name;
        this.in_node = in_node;
        this.in_slot_name = in_slot_name;
        this.current_state = VisualState.normal;
    }

    Connector.prototype.serialize = function() {
        return [
            this.id,
            this.out_node.id,
            this.out_slot_name,
            this.in_node.id,
            this.in_slot_name
        ];
    };

    Connector.prototype.pluginRenderingTemplate = function(template) {
        for (const [name, value] of Object.entities(template)) {
            this[name] = value;
        }
    }

    Connector.prototype.draw = function(ctx, lod) {
        if (!this.style) return;
        let draw_method = this.style[this.current_state].draw;
        draw_method(this.style, ctx, lod);
    }

    Connector.prototype.fromPos = function() {
        if (!this.out_node) return new Point(0, 0);
        return this.out_node.getConnectedAnchorPosInScene(this.out_slot_name);
    };

    Connector.prototype.toPos = function() {
        if (!this.in_node) return new Point(0, 0);
        return this.out_node.getConnectedAnchorPosInScene(this.out_slot_name);
    };

    Connector.prototype.width = function() {
        return Math.abs(this.fromPos().x - this.toPos().x);
    }

    Connector.prototype.height = function() {
        return Math.abs(this.fromPos().y - this.toPos().y);
    }

    Connector.prototype.getBoundingRect = function() {
        const from = this.fromPos();
        const to = this.toPos();
        let x = Math.min(from.x, to.x);
        let y = Math.min(from.y, to.y);
        return new Rect(x, y, this.width(), this.height());
    }

    Connector.prototype.mouseEnter = function() {
        this.current_state = VisualState.hovered;
    };

    Connector.prototype.mouseLeave = function() {
        this.current_state = VisualState.normal;
    };

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
    function areMultipleValuesInArray(values, Array) {
        return values.every(s => {
            return array.includes(s)
        });
    }

    /**
     * Node slot
     * @method node slot class
     * @param {SlotPos} t_a
     * @param {SlotPos} t_b
     * @return {Boolean} do these two slot type match
     */
    function isSlotPosMatch(t_a, t_b) {
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

    function Point(x, y) {
        if (Array.isArray(x)) {
            if (x.length === 0)
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

    Point.prototype.add = function(delta_x, delta_y) {
        this.x += delta_x ? delta_x : 0;
        this.y += delta_y ? delta_y : 0;
    };

    Point.prototype.distanceTo = function(p) {
        return Math.sqrt(Math.pow(p.x - this.x, 2) + Math.pow(p.y - this.y, 2));
    };

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
        this.current_state = VisualState.normal;
        this.translate = new Point(0, 0);
    };

    NodeSlot.prototype.mouseEnter = function() {
        this.current_state = VisualState.hovered;
    };

    NodeSlot.prototype.resetState = function() {
        this.current_state = VisualState.normal;
    };

    NodeSlot.prototype.mouseLeave = function() {
        this.current_state = VisualState.normal;
    };

    NodeSlot.prototype.mousePressed = function() {
        this.current_state = VisualState.pressed;
    };

    NodeSlot.prototype.isInput = function() {
        return this.slot_pos == SlotPos.exec_in || this.slot_pos == SlotPos.data_in;
    }

    NodeSlot.prototype.addExtraInfo = function(extra_info) {
        Object.assign(this.extra_info, extra_info);
    };

    NodeSlot.prototype.isConnected = function() {
        return this.connections > 0;
    };

    NodeSlot.prototype.allowConnectTo = function(other_slot) {
        if (!isSlotPosMatch(this.slot_pos, other_slot.slot_pos))
            return new SlotConnection(SlotConnectionMethod.null,
                '{this.data_type} is not compatible with {other_slot.data_type}');

        if (!TypeRegistry.isDataTypeMatch(this.data_type, other_slot.data_type))
            return new SlotConnection(SlotConnectionMethod.null,
                '{this.data_type} is not compatible with {other_slot.data_type}');

        if (this.isConnected() && !this.allowMultipleConnections) {
            return new SlotConnection(SlotConnectionMethod.replace,
                'Replace the existing connections');
        }

        return new SlotConnection(SlotConnectionMethod.add,
            'Add a connection');
    };

    NodeSlot.prototype.addConnection = function() {
        if (this.allowMultipleConnections()) {
            this.connections += 1;
        } else {
            this.connections = 1;
        }
    };

    NodeSlot.prototype.breakConnection = function() {
        if (this.connections > 0)
            this.connections = this.connections - 1;
    };

    NodeSlot.prototype.clearConnections = function() {
        this.connections = 0;
    };

    NodeSlot.prototype.allowMultipleConnections = function() {
        if (this.slot_pos === SlotPos.exec_in || this.slot_type === SlotPos.data_out) {
            return true;
        }
        return false;
    };

    NodeSlot.prototype.pluginRenderingTemplate = function(template) {
        for (const [name, value] of Object.entities(template)) {
            this[name] = value;
        }
    };

    NodeSlot.prototype.getBoundingRect = function() {
        const size = this.size();
        return new Rect(this.translate.x + size.x, this.translate.y + size.y, size.width, size.height);
    };

    NodeSlot.prototype.draw = function(ctx, lod) {
        if (!this.style) return;
        let type_style = this.style[this.data_type];
        if (!type_style) {
            type_style = this.style['default'];
        }
        else
            Object.setPrototypeOf(type_style, this.style['default']);
        const connected_state = this.isConnected() ? "connected" : "unconnected";
        let draw_method = type_style[connected_state][this.current_state].draw;
        draw_method(type_style, ctx, lod);
    }

    const VisualState = {
        normal: "normal",
        hovered: "hovered",
        pressed: "pressed"
    }
    // *************************************************************
    //   Node CLASS                                          *******
    // *************************************************************

    /*
	title: string

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
     * @class Node
     * @param {String} name a name for the node
     */

    function Node() {}

    Node.prototype.id = undefined;
    Node.prototype.title = undefined;
    Node.prototype.type = "*";
    Node.prototype.desc = "";
    Node.prototype.inputs = {};
    Node.prototype.outputs = {};
    Node.prototype.allow_resize = false;
    Node.prototype.translate = new Point(0, 0);
    Node.prototype.scale = new Point(1, 1);
    Node.prototype.collidable_components = [];
    Node.prototype.current_state = VisualState.normal;

    Node.prototype.serialize = function() {
        let o = {
            id: this.id,
            type: this.type,
            translate: [this.translate.x, this.translate.y],
            scale: [this.scale.x, this.scale.y],
        };
        for (const slot of Object.values(this.inputs).concat(Object.values(this.outputs))) {
            o["connections"].push(slot.connections)
        }
        return o;
    }

    Node.prototype.configure = function(config) {
        if (!config)
            return;
        this.id = config.id;
        this.translate.x = config.translate[0];
        this.translate.y = config.translate[1];
        this.scale.x = config.scale[0];
        this.scale.y = config.scale[1];
        let i = 0;
        for (const slot of Object.values(this.inputs).concat(Object.values(this.outputs))) {
            o["connections"].push(config.connections[i] || 0);
            i++;
        }
    }

    Node.prototype.getTitle = function() {
        return this.title || this.constructor.title;
    };

    Node.prototype.getConnectedAnchorPosInScene = function(slot_name) {
        const slot = this.inputs[slot_name] || this.outputs[slot_name];
        if (!slot) return undefined;
        let local_pos = slot.getConnectedAnchorPos();
        return new Point(this.translate.x + local_pos.x, this.translate.y + local_pos.y);
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
    Node.prototype.addSlotTo = function(slot_name, slot_pos, data_type, default_value, extra_info, slots, call_back) {
        assertNameUniqueIn(slot_name, Object.keys(this.inputs));
        assertNameUniqueIn(slot_name, Object.keys(this.outputs));
        let slot = new NodeSlot(slot_name, slot_pos, data_type, default_value);
        slot.addExtraInfo(extra_info);
        slots[slot_name] = slot;
        slot.pluginRenderingTemplate(template['NodeSlot']);
        this.collidable_components.append(slot);
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
    Node.prototype.addInput = function(slot_name, type, default_value, extra_info) {
        const slot_type = type === SlotType.Exec ? SlotPos.exec_in : SlotPos.data_in;
        this.addSlotTo(slot_name, slot_type, type, default_value, extra_info, this.inputs, this.onInputAdded);
    };

    /**
     * add a new output slot to use in this node
     * @method addOutput
     * @param {string} slot_name
     * @param {string} type string defining the output type ("vec3","number",...)
     * @param {Object} extra_info this can be used to have special properties of an output (label, special color, position, etc)
     */
    Node.prototype.addOutput = function(slot_name, type, extra_info) {
        const slot_type = type === SlotType.Exec ? SlotPos.exec_out : SlotPos.data_out;
        this.addSlotTo(slot_name, slot_type, type, undefined, extra_info, this.outputs, this.onOutputAdded);
    };

    /**
     * add several new input slots in this node
     * @method addInputs
     * @param {Array} inputs array of triplets like [[name, type, default_value, extra_info],[...]]
     */
    Node.prototype.addInputs = function(inputs) {
        for (const input of inputs) {
            this.addInput(input.name, input.type, default_value, input.extra_info)
        }
    };

    /**
     * add many output slots to use in this node
     * @method addOutputs
     * @param {Array} outputs array of triplets like [[name, type, extra_info],[...]]
     */
    Node.prototype.addOutputs = function(outputs) {
        for (const output of outputs) {
            this.addOutput(output.name, output.type, output.extra_info)
        }
    };

    /**
     * remove one slot from the inputs or outputs, here we don't deal with connections, the graph will handle it.
     * @method addOutputs
     * @param {String} slot_name the name of the slot to be removed
     * @param {Arrary}  slots intput or outputs slots
     */
    Node.prototype.removeSlotFrom = function(slot_name, slots, call_back) {
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
    Node.prototype.removeInput = function(slot_name) {
        this.removeSlotFrom(slot_name, this.inputs, this.onInputRemoved);
    };

    /**
     * remove an existing output slot
     * @method removeOutput
     * @param {String} slot_name
     */
    Node.prototype.removeOutput = function(slot_name) {
        this.removeSlotFrom(slot_name, this.outputs, this.onOutputRemoved);
    };

    Node.prototype.getSlot = function(slot_name) {
        return this.inputs[slot_name] || this.outputs[slot_name];
    };

    // *********************** node manipulation **************************************
    Node.prototype.allowConnectTo = function(slot_name, to_node, to_slot) {
        let slot = this.inputs[slot_name] || this.outputs[slot_name];
        if (!slot || !to_node || !to_slot) {
            return new SlotConnection(SlotConnectionMethod.null, 'Some input parameters are undefined.');
        }

        if (this == to_node) {
            return new SlotConnection(SlotConnectionMethod.null, 'Both are on the same node.');
        }

        return slot.allowConnectTo(to_slot)
    };

    /**
     * add a connection to the slot. The connector is not recored because the slot can be connected only when the node is added to the graph that will
     * manage how to connect, access to the connectors and nodes.
     * @method connect
     * @param {String} slot_name
     */
    Node.prototype.addConnectionOf = function(slot) {
        if (!slot) {
            return;
        }
        slot.addConnection()

        if (this.onAddConnection) {
            this.onAddConnection(slot);
        }
    };

    Node.prototype.addConnectionOfInput = function(slot_name) {
        this.addConnectionOf(this.inputs[slot_name])
    };

    Node.prototype.addConnectionOfOutput = function(slot_name) {
        this.addConnectionOf(this.outputs[slot_name])
    };

    Node.prototype.breakConnectionOf = function(slot) {
        if (!slot) {
            return;
        }
        slot.breakConnection()

        if (this.onBreakConnection) {
            this.onBreakConnection(slot);
        }
    };

    Node.prototype.breakConnectionOfOutput = function(slot_name) {
        this.breakConnectionOf(this.outputs[slot_name])
    };

    Node.prototype.breakConnectionOfInput = function(slot_name) {
        this.breakConnectionOf(this.inputs[slot_name])
    };

    /**
     * disconnect one output to an specific node
     * @method disconnectOutput
     * @param {String} slot_name
     */
    Node.prototype.clearConnectionsOf = function(slot) {
        if (!slot) {
            return;
        }
        slot.clearConnections()

        if (this.onClearConnection) {
            this.onClearConnection(slot_name);
        }
    };

    Node.prototype.clearInConnections = function() {
        for (let slot of this.inputs) {
            this.clearConnectionsOf(slot)
        }
    };

    Node.prototype.clearOutConnections = function() {
        for (let slot of this.outputs) {
            this.clearConnectionsOf(slot)
        }
    };

    Node.prototype.clearAllConnections = function() {
        this.clearInConnections();
        this.clearOutConnections();
    };

    Node.prototype.addTranslate = function(delta_x, delta_y) {
        this.translate.add(delta_x, delta_y);
        if (this.onMove) {
            this.onMove(delta_x, delta_y);
        }
    };

    Node.prototype.getBoundingRect = function() {
        const size = this.size();
        return new Rect(this.translate.x + size.x, this.translate.y + size.y, size.width, size.height);
    };

    Node.prototype.draw = function(ctx, lod) {
        if (!this.style) return;
        let state_draw_method = this.style[this.current_state];
        if (state_draw_method)
            state_draw_method.draw(ctx, lod);
    };

    Node.prototype.pluginRenderingTemplate = function(template) {
        let default_node = template['Node'];
        let this_node = template[this.constructor.name];
        if (this_node)
            Object.setPrototypeOf(this_node.prototype, default_node.prototype);
        else
            this_node = default_node;
        for (const [name, value] of Object.entities(this_node)) {
            this[name] = value;
        }

        for (let slot of Object.values(this.inputs.concat(this.outputs))) {
            slot.pluginRenderingTemplate(template['NodeSlot']);
        }
    }

    Node.prototype.mouseEnter = function() {
        this.current_state = VisualState.hovered;
    };

    Node.prototype.moveLeave = function() {
        this.current_state = VisualState.normal;
    };

    Node.prototype.isSelected = function() {
        return this.current_state == VisualState.pressed;
    }

    Node.prototype.selected = function() {
        if (this.isSelected())
            return;
        this.current_state = VisualState.pressed;
        if (this.onSelected) {
            this.onSelected();
        }
    }

    Node.prototype.deselected = function() {
        if (!this.isSelected())
            return;
        this.current_state = VisualState.normal;
        if (this.onDeselected) {
            this.onDeselected();
        }
    }

    Node.prototype.toggleSelection = function() {
        if (this.isSelected())
            this.current_state = VisualState.normal;
        else
            this.current_state = VisualState.pressed;
    }

    Node.prototype.pressed = function() {
        this.current_state = VisualState.pressed;
    };


    function LGraphComment() {
        this.nodes_inside = {};
        this.allow_resize = true;
    }

    LGraphComment.title = "Comment";
    LGraphComment.type = "comment";
    LGraphComment.desc = "Comment";

    LGraphComment.prototype.move = function(delta_x, delta_y) {
        for (const node of this.nodes_inside) {
            node.addTranslate(delta_x, delta_y)
        }
        if (this.onMove) {
            this.onMove(delta_x, delta_y);
        }
    };

    LGraphComment.prototype.addNode = function(node) {
        this.nodes_inside[node.id] = node;
    };

    LGraphComment.prototype.removeNode = function(node_id) {
        delete this.nodes_inside[node_id];
    };

    function textWidth(text, font_size) {
        if (!text)
            return 0;
        return font_size * text.length * 0.6;
    }

    let RenderingTemplate = {
        name: "RenderingTemplate",
        scene: {
            style: {
                owner: null,
                current_bg: null,
                "0": {
                    image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkAQMAAABKLAcXAAAABlBMVEXMysz8/vzemT50AAAAIklEQVQ4jWNgQAH197///Q8lPtCdN+qWUbeMumXULSPALQDs8NiOERuTbAAAAABJRU5ErkJggg==",
                    image_repetition: "repeat",
                    global_alpha: 1,
                },
                "1": {
                    color: "#FFFFFFFF",
                    global_alpha: 1,
                },
                draw: function(ctx, lod) {
                    const rect = this.owner.sceneRect();
                    let style = this[lod];
                    if (!style) style = this[0];
                    ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
                    if (style.image) {
                        let img_need_loaded = !this.current_bg || this.current_bg.src != style.image;
                        if(img_need_loaded) {
                            this.current_bg = new Image();
                            this.current_bg.src = style.image;
                            this.current_bg.onload = () => {
                                this.owner.renderer.forceRenderLayer(["background"]);
                            }
                        } else{
                            ctx.fillStyle = ctx.createPattern(this.current_bg, style.image_repetition);
                            ctx.imageSmoothingEnabled = true;
                            ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
                        }
                    } else {
                        ctx.fillStyle = style.color;
                        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
                    }
                }
            }
        },
        // different slot data types(number, string..), different states style sheet(selected, unselected, hovered) applied on
        // different LOD of shape
        Nodeslot: {
            icon_width: 10,
            icon_height: 20,
            line_width: 2,
            to_render_text: true,
            font_size: 12,
            font: '12px Arial',
            padding_between_icon_text: 3,
            width: function() {
                let text_width = this.to_render_text ? textWidth(this.font_size, this.name) : 0;
                return this.icon_width + text_width > 0 ? this.padding_between_icon_text + text_width : 0;
            },
            height: function() {
                return this.icon_height;
            },
            getConnectedAnchorPos: function() {
                let pos = {
                    x: this.icon_width / 2.0,
                    y: this.icon_height / 2.0
                };
                if (this.isInput())
                    pos.x *= -1;
                return pos;
            },
            size: function() {
                let x = this.isInput() ? 0 : -this.width();
                return {
                    x: x,
                    y: 0,
                    width: this.width(),
                    height: this.height()
                };
            },
            style: {
                owner: null,
                "default": {
                    unconnected: {
                        normal: {
                            ctx_style: {
                                fillStyle: null,
                                strokeStyle: "#80b3ff"
                            },
                            draw: function(this_style, ctx, lod) {
                                let ctx_style = this_style.unconnected.normal.ctx_style;
                                this_style._draw_when_normal(this_style, ctx, ctx_style, lod);
                            }
                        },
                        hovered: {
                            ctx_style: {
                                fillStyle: null,
                                strokeStyle: "#80b3ff"
                            },
                            draw: function(this_style, ctx, lod) {
                                let ctx_style = this_style.unconnected.hovered.ctx_style;
                                this_style._draw_when_hovered(this_style, ctx, ctx_style, lod);
                            }
                        }
                    },
                    connected: {
                        normal: {
                            ctx_style: {
                                fillStyle: "#FF0303FF",
                                strokeStyle: "#FF0303FF"
                            },
                            draw: function(this_style, ctx, lod) {
                                let ctx_style = this_style.connected.normal.ctx_style;
                                this_style._draw_when_normal(this_style, ctx, ctx_style, lod);
                            }
                        },
                        hovered: {
                            ctx_style: {
                                fillStyle: "#FF0303FF",
                                strokeStyle: "#FF0303FF"
                            },
                            draw: function(this_style, ctx, lod) {
                                let ctx_style = this_style.connected.hovered.ctx_style;
                                this_style._draw_when_hovered(this_style, ctx, ctx_style, lod);
                            }
                        },
                    },
                    _draw_when_normal: function(this_style, ctx, ctx_style, lod) {
                        this_style.drawShape(ctx, ctx_style);
                        if (lod == 0 && this.to_render_text)
                            this_style.drawName(ctx, ctx_style);
                    },
                    _draw_when_hovered: function(this_style, ctx, ctx_style, lod) {
                        this_style._draw_when_normal(this_style, ctx, ctx_style, lod);
                        if (lod == 0)
                            this_style.hovered(ctx, ctx_style);
                    },
                    drawShape: function(ctx, style) {
                        ctx.save();
                        ctx.beginPath();
                        if (this.isInput())
                            ctx.move(-this.height, 0);
                        ctx.arc(this.height / 2.0, this.height / 2.0, this.height / 2.0, 0, Math.PI * 2, true);
                        ctx.closePath();
                        if (style.fillStyle) {
                            ctx.fillStyle = style.fillStyle;
                            ctx.fill();
                        }
                        if (style.strokeStyle) {
                            ctx.lineWidth = this.lineWidth;
                            ctx.strokeStyle = style.strokeStyle;
                            ctx.stroke();
                        }
                        ctx.move(0, 0);
                        ctx.restore();
                    },
                    drawName: function(ctx, style) {
                        ctx.save();
                        ctx.font = this.font;
                        if (style.fillStyle) ctx.fillStyle = style.fillStyle;
                        ctx.textBaseline = "middle";
                        let x = 0;
                        if (this.isInput()) {
                            ctx.textAlign = "left";
                            x = this.icon_width + this.padding_between_icon_text;
                        } else {
                            ctx.textAlign = "right";
                            x = -(this.icon_width + this.padding_between_icon_text);
                        }
                        ctx.fillText(this.name, x, this.icon_height / 2.0);
                        ctx.restore();
                    },
                    hovered: function(ctx, style) {
                        ctx.globalAlpha = 0.2;
                        if (style.fillStyle) ctx.fillStyle = style.fillStyle;
                        ctx.fillRect(-this.line_width * 2, -this.line_width * 2, this.width() + this.line_width * 2, this.height() + this.line_width);
                        ctx.globalAlpha = 1;
                    },
                },
                "Exec": {
                    unconnected: {
                        normal: {
                            ctx_style: {
                                fillStyle: null,
                                strokeStyle: "#FFFFFF"
                            }
                        },
                        hovered: {
                            ctx_style: {
                                fillStyle: null,
                                strokeStyle: "#FFFFFF"
                            }
                        },
                    },
                    connected: {
                        normal: {
                            ctx_style: {
                                fillStyle: "#FFFFFF",
                                strokeStyle: "#FFFFFF"
                            }
                        },
                        hovered: {
                            ctx_style: {
                                fillStyle: "#FFFFFF",
                                strokeStyle: "#FFFFFF"
                            }
                        },
                    },
                    drawShape: function(ctx, style) {
                        ctx.save();
                        ctx.beginPath();
                        if (this.isInput())
                            ctx.move(-this.height, 0);
                        else
                            ctx.moveTo(0, 0);
                        ctx.lineTo(this.width / 2.0, 0);
                        ctx.lineTo(this.width, this.height / 2.0);
                        ctx.lineTo(this.width / 2.0, this.height);
                        ctx.lineTo(0, this.height);
                        ctx.closePath();
                        if (style.fillStyle) {
                            ctx.fillStyle = style.fillStyle;
                            ctx.fill();
                        }
                        if (style.strokeStyle) {
                            ctx.lineWidth = this.lineWidth;
                            ctx.strokeStyle = style.strokeStyle;
                            ctx.stroke();
                        }
                        ctx.moveTo(0, 0);
                        ctx.restore();
                    },
                },
                "Number": {
                    unconnected: {
                        normal: {
                            ctx_style: {
                                fillStyle: null,
                                strokeStyle: "#00FF4AFF"
                            }
                        },
                        hovered: {
                            ctx_style: {
                                fillStyle: null,
                                strokeStyle: "#00FF4AFF"
                            }
                        },
                    },
                    connected: {
                        normal: {
                            ctx_style: {
                                fillStyle: "#00FF4AFF",
                                strokeStyle: "#00FF4AFF"
                            }
                        },
                        hovered: {
                            ctx_style: {
                                fillStyle: "#00FF4AFF",
                                strokeStyle: "#00FF4AFF"
                            }
                        },
                    },
                },
            }
        },
        Node: {
            global_alpha: 1,
            title_bar: {
                to_render: true,
                color: "#999",
                height: 30,
                font_size: 14,
                font: "14 px Arial",
                font_fill_color: "FFFFFFFF"
            },
            slot_to_top_border: 3,
            slot_to_side_border: 3,
            horizontal_padding_between_slots: 5,
            vertical_padding_between_slots: 5,
            width: function() {
                let max_width = this.slot_to_side_border * 2 + this.vertical_padding_between_slots;
                const input_slots = Object.values(this.inputs);
                const output_slots = Object.values(this.outputs);
                for (let i = 0; i < Math.max(input_slots.length, output_slots.length); i++) {
                    let width = input_slots[i] || 0 + output_slots[i] || 0;
                    if (max_width < width)
                        max_width = width;
                }
                if (this.central_text.to_render)
                    max_width += this.central_text.width;
                return max_width;
            },
            height: function() {
                let left_side = this.slot_to_side_border * 2;
                for (const input of Object.values(this.inputs)) {
                    left_side += input.height();
                }
                left_side += this.horizontal_padding_between_slots * Math.max((Object.values(this.inputs).length - 1), 0);
                let right_side = this.slot_to_side_border * 2;
                for (const output of Object.values(this.outputs)) {
                    right_side += output.height();
                }
                right_side += this.horizontal_padding_between_slots * Math.max((Object.values(this.outputs).length - 1), 0);
                let central_text_height = this.central_text.to_render * this.central_text.height;
                return Math.max(left_side, right_side, central_text_height) + this.title_bar.to_render ? this.title_bar.height : 0
            },
            size: function() {
                let y = this.title_bar.to_render ? -this.title_bar.height : 0;
                return {
                    x: 0,
                    y: y,
                    width: this.width(),
                    height: this.height()
                }
            },

            style: {
                normal: {
                    ctx_style: {
                        fill_style: "#ffffff",
                        stroke_style: null,
                        line_width: 1,
                        round_radius: 8,
                        font_color: "FFFFFFFF"
                    },
                    draw: function(this_style, ctx, lod) {
                        let style = this_style.normal.ctx_style;
                        this_style.draw(this_style, ctx, style, lod);
                    }
                },
                hovered: {
                    ctx_style: {
                        fill_style: "#ffcf00",
                        stroke_style: "FFCF00FF",
                        line_width: 1,
                        round_radius: 8,
                        font_color: "FFFFFFFF"
                    },
                    draw: function(this_style, ctx, lod) {
                        let style = this_style.hovered.ctx_style;
                        this_style.draw(this_style, ctx, style, lod);
                    }
                },
                pressed: {
                    ctx_style: {
                        fill_style: "#0053FFFF",
                        stroke_style: "0053FFFF",
                        line_width: 1,
                        round_radius: 8,
                        font_color: "FFFFFFFF"
                    },
                    draw: function(this_style, ctx, lod) {
                        let style = this_style.pressed.ctx_style;
                        this_style.draw(this_style, ctx, style, lod);
                    }
                },
            },

            draw: function(this_style, ctx, ctx_style, lod) {
                this_style.drawBackground(this_style, ctx, ctx_style, lod);
                this_style.drawTitle(this_style, ctx, ctx_style, lod);
                this_style.drawSlots(this_style, ctx, ctx_style, lod);
                this_style.drawCentral(this_style, ctx, ctx_style, lod);
            },

            drawBackground: function(this_style, ctx, ctx_style, lod) {
                ctx.save();
                if (ctx_style.fill_style) ctx.fillStyle = ctx_style.fill_style;
                if (ctx_style.stroke_style) {
                    ctx.strokeStyle = ctx_style.stroke_style;
                    ctx.lineWidth = ctx_style.line_width;
                }
                ctx.beginPath();
                const rect = this.size();
                ctx.roundRect(rect.x, rect.y, rect.width, rect.height, [ctx_style.round_radius]);
                ctx.fill();
                if (ctx_style.stroke_style) {
                    ctx.stroke();
                }
                ctx.restore();
            },

            drawTitle: function(ctx, ctx_style, lod) {
                if (!this.title_bar.to_render)
                    return;
                ctx.save();
                ctx.fillStyle = this.title_bar.color;
                if (lod > 0) {
                    ctx.fillRect(this.size()[0], this.size()[1], this.size()[2], this.title_bar.height);
                    ctx.fill();
                } else {
                    ctx.roundRect(this.size()[0], this.size()[1], this.size()[2], this.title_bar.height, [ctx_style.round_radius]);
                    ctx.font = this.title_bar.font;
                    ctx.fillStyle = this.title_bar.font_fill_color;
                    ctx.textBaseline = "middle";
                    ctx.textAlign = "left";
                    ctx.fillText(this.title, this.icon_width + this.padding_between_icon_text, this.height / 2.0);
                }
                ctx.restore();
            },

            drawSlots: function(ctx, lod) {
                ctx.save();
                let index = 1;
                for (let slot of Object.values(this.inputs)) {
                    ctx.save();
                    slot.translate.x = this.slot_to_side_border;
                    slot.translate.y = this.slot_to_top_border + (i - 1) * this.horizontal_padding_between_slots;
                    index++;
                    ctx.translate(slot.translate);
                    slot.draw(ctx, lod);
                    ctx.restore();
                }
                index = 1;
                for (let slot of Object.values(this.outputs)) {
                    ctx.save();
                    slot.translate.x = this.width() - this.slot_to_side_border;
                    slot.translate.y = this.slot_to_top_border + (i - 1) * this.horizontal_padding_between_slots;
                    index++;
                    ctx.translate(slot.translate);
                    slot.draw(ctx, lod);
                    ctx.restore();
                }
                ctx.restore();
            },

            drawCentral: function(ctx, ctx_style, lod) {
                if (!this.central_text.to_render && lod > 0)
                    return;
                ctx.save();
                ctx.fillStyle = this.central_text.font_fill_color;
                ctx.font = this.title_bar.font;
                ctx.textBaseline = "middle";
                ctx.textAlign = "center";
                ctx.fillText(this.central_text.text, this.icon_width + this.padding_between_icon_text, this.height / 2.0);
                ctx.restore();
            }
        },
        CommentNode: {
            alpha: 0.5,
            _width: 20,
            _height: 20,
            _min_width: 2,
            _min_height: 2,
            width: function() {
                return this._width;
            },
            setWidth: function(w) {
                this._width = w;
                this._width = Math.max(this._min_width, this._width);
            },
            height: function() {
                return this._height;
            },
            setHeight: function(h) {
                this._height = h;
                this._height = Math.max(this._min_height, this._height);
            },
            size: function() {
                return {
                    x: 0,
                    y: 0,
                    width: this.width(),
                    height: this.height()
                }
            },

            style: {
                normal: {
                    ctx_style: {
                        fill_style: "#ffffff",
                        stroke_style: null
                    }
                },
                pressed: {
                    ctx_style: {
                        fill_style: "#0053FFFF",
                        stroke_style: "0053FFFF"
                    }
                },
            },
            draw: function(this_style, ctx, ctx_style, lod) {
                ctx.save()
                ctx.globalAlpha = this.alpha;
                ctx.fillStyle = ctx_style.fill_style;
                ctx.stroke_style = ctx_style.stroke_style;
                ctx.beginPath();
                ctx.rect(0, 0, this.width, this.height);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            },
        },

        Connector: {
            default_color: "#bdbbbb",
            style: {
                normal: {
                    ctx_style: {
                        stroke_style: "#fffdfd",
                        line_width: 2,
                        line_join: "round",
                        alpha: 1
                    },
                    draw: function(this_style, ctx, lod) {
                        const ctx_style = this_style.normal.ctx_style;
                        this.draw(this_style, ctx, ctx_style, lod);
                    }
                },
                hovered: {
                    ctx_style: {
                        stroke_style: "#f7bebe",
                        line_width: 2,
                        line_join: "round",
                        alpha: 1
                    },
                    draw: function(this_style, ctx, lod) {
                        const ctx_style = this_style.hovered.ctx_style;
                        this.draw(this_style, ctx, ctx_style, lod);
                    }
                }
            },
            draw: function(this_style, ctx, ctx_style, lod) {
                ctx.save();
                ctx.beginPath();
                ctx.lineJoin = ctx_style.line_join;
                ctx.lineWidth = ctx_style.line_width;
                ctx.strokeStyle = ctx_style.stroke_style;
                ctx.globalAlpha = ctx_style.alpha;
                const from = this.fromPos();
                const to = this.toPos();
                const distance = from.distanceTo(to);
                ctx.moveTo(from.x, from.y);
                ctx.bezierCurveTo(
                    from.x + distance * 0.25, from.y,
                    to.x - distance * 0.25, to.y,
                    to.x, to.y
                );
                ctx.stroke();
                ctx.restore();
            },
        }
    }

    /**
     * @class RenderedLayer
     * @param {Boolean} re_render
     * @param {HTMLCanvas} canvas
     * @param {Function} render_method
     * @constructor
     */
    function RenderedLayer(re_render, canvas, render_method) {
        this.re_render = re_render;
        this.canvas = canvas;
        this.render_method = render_method;
    };

    RenderedLayer.prototype.updateLayerSize = function(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.re_render = true;
    };

    /**
     * This Renderer will render the visible items in the scene on the canvas.
     * @class Renderer
     * @constructor
     * @param {Scene} scene
     */
    function Renderer(scene) {
        this.scene = scene;
        this.layers = {};
        this.is_rendering = false;
        this.render_method_for_layer = {
            "action": this._renderActions.bind(this),
            "nodes": this._renderNodes.bind(this),
            "connectors": this._renderConnectors.bind(this),
            "background": this._renderBackground.bind(this)
        };
        this.initRenderLayers();
    };

    Renderer.prototype.getCanvas = function() {
        return this.scene.canvas;
    };

    Renderer.prototype.createNewCanvas = function() {
        let canvas = document.createElement('canvas');
        canvas.width = this.getCanvas().width;
        canvas.height = this.getCanvas().height;
        return canvas;
    };

    Renderer.prototype.initRenderLayers = function() {
        for (const [name, render_method] of Object.entries(this.render_method_for_layer)) {
            this.layers[name] = new RenderedLayer(true, this.createNewCanvas(), render_method);
        }
    };

    Renderer.prototype.getDrawingContext = function() {
        return this.scene.drawing_context || "2d";
    };

    /**
     *
     * @param changed_obj "background" "connectors" "nodes" "action"
     */
    Renderer.prototype.setToRender = function(which_layer) {
        if (this.layers[which_layer]) {
            this.layers[which_layer].re_render = true;
        }
    };

    Renderer.prototype.updateAllLayersSize = function(width, heigth) {
        for (const layer of Object.values(this.layers)) {
            layer.updateLayerSize(width, heigth);
        }
        if(!this.is_rendering)
            this.renderOneFrame();
    };

    /**
     * @method getCanvasWindow
     * @return {window} returns the window where the canvas is attached (the DOM root node)
     */
    Renderer.prototype.getRenderWindow = function() {
        let doc = this.getCanvas().ownerDocument;
        return doc.defaultView || doc.parentWindow;
    };

    Renderer.prototype.isCanvasZeroSize = function() {
        if (this.getCanvas().width == 0 || this.getCanvas().height == 0) {
            return true;
        }
        return false;
    };

    Renderer.prototype.getDrawingContextFrom = function(canvas) {
        return canvas.getContext(this.getDrawingContext());
    };

    Renderer.prototype._ctxFromViewToScene = function(ctx) {
        ctx.save();
        ctx.scale(this.scene.view.scale, this.scene.view.scale);
        ctx.translate(this.scene.view.translate.x, this.scene.view.translate.y);
    };

    Renderer.prototype._ctxFromSceneToView = function(ctx) {
        ctx.restore();
    };

    Renderer.prototype._ctxFromSceneToNode = function(ctx, node) {
        ctx.save();
        ctx.translate(node.translate.x, node.translate.y);
        ctx.scale(node.scale.x, node.scale.y);
    };

    Renderer.prototype._ctxFromNodeToScene = function(ctx) {
        ctx.restore();
    };

    Renderer.prototype._renderEachLayer = function() {
        let re_render_any_layer = false;
        for (let layer of Object.values(this.layers)) {
            if (layer.re_render) {
                re_render_any_layer = true;
                layer.render_method();
                layer.re_render = false;
            }
        }
        return re_render_any_layer;
    }

    Renderer.prototype.forceRenderLayer = function(names) {
        for (let name of names) {
            const layer = this.layers[name];
            layer.re_render = true;
        }
        this.renderOneFrame()
    }

    Renderer.prototype._compositeLayers = function() {
        let ctx = this.getDrawingContextFrom(this.getCanvas());
        this._ctxFromViewToScene(ctx);
        const rect = this.scene.sceneRect();
        ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
        for (let layer of Object.values(this.layers)) {
            ctx.drawImage(layer.canvas, 0, 0);
        }
        this._ctxFromSceneToView(ctx);
    }

    Renderer.prototype._render = function() {
        if (this.isCanvasZeroSize()) throw "Canvas is zero size.";
        const re_render_any_layer = this._renderEachLayer();
        if (!re_render_any_layer) return;
        this._compositeLayers();
    };

    Renderer.prototype._renderBackground = function() {
        let layer = this.layers['background'];
        let ctx = this.getDrawingContextFrom(layer.canvas);
        this._ctxFromViewToScene(ctx);
        const rect = this.scene.sceneRect();
        ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
        this.scene.draw(ctx, this.scene.lod);
        this._ctxFromSceneToView(ctx);
    };

    Renderer.prototype._renderConnectors = function() {
        let layer = this.layers['connectors'];
        let ctx = this.getDrawingContextFrom(layer.canvas);
        this._ctxFromViewToScene(ctx);
        const scene_rect = this.scene.sceneRect();
        ctx.clearRect(scene_rect.x, scene_rect.y, scene_rect.width, scene_rect.height);
        for (let connector of this.scene.visibleConnectors()) {
            connector.draw(ctx, this.scene.lod);
        }
        this._ctxFromSceneToView(ctx);
    };


    Renderer.prototype._renderNodes = function() {
        let layer = this.layers['nodes'];
        let ctx = this.getDrawingContextFrom(layer.canvas);
        this._ctxFromViewToScene(ctx)
        const scene_rect = this.scene.sceneRect();
        ctx.clearRect(scene_rect.x, scene_rect.y, scene_rect.width, scene_rect.height);
        for (let node of Object.values(this.scene.visibleNodes())) {
            this._ctxFromSceneToNode(ctx, node);
            node.draw(ctx, this.scene.lod);
            this._ctxFromNodeToScene(ctx);
        }
        this._ctxFromSceneToView(ctx);
    };

    Renderer.prototype._renderActions = function(draw) {
        let layer = this.layers['nodes'];
        let ctx = this.getDrawingContextFrom(layer.canvas);
        const scene_rect = this.scene.sceneRect();
        ctx.clearRect(scene_rect.x, scene_rect.y, scene_rect.width, scene_rect.height);
        if(!this.scene.command_in_process || !this.scene.command_in_process.draw)
            return;
        this._ctxFromViewToScene(ctx);
        this.scene.command_in_process.draw(ctx, this.scene.lod);
        this._ctxFromSceneToView(ctx);
    };

    Renderer.prototype.startRender = function() {
        if (this.is_rendering) return;
        this.is_rendering = true;
        renderFrame.call(this);

        function renderFrame() {
            this._render();
            let window = this.getRenderWindow();
            if (this.is_rendering) {
                window.requestAnimationFrame(renderFrame.bind(this));
            }
        }
    };

    Renderer.prototype.renderOneFrame = function() {
        this._render();
    };

    Renderer.prototype.stopRender = function() {
        this.is_rendering = false;
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
    function Rect(left, top, width, height) {
        this.x_1 = left;
        this.y_1 = top;
        this.x_2 = left + width - 1;
        this.y_2 = top + height - 1;
        Object.defineProperties(this, {
            "x": {
                get() {
                    return this.x_1;
                },
                set(x) {
                    this.x_1 = x;
                }
            },
            "y": {
                get() {
                    return this.y_1;
                },
                set(y) {
                    this.y_1 = y;
                }
            },
            "left": {
                get() {
                    return this.x_1;
                },
                set(x) {
                    this.x_1 = x;
                }
            },
            "top": {
                get() {
                    return this.y_1;
                },
                set(y) {
                    this.y_1 = y;
                }
            },
            "width": {
                get() {
                    return this.x_2 - this.x_1 + 1;
                },
                set(w) {
                    this.x_2 = this.x_1 + w - 1;
                }
            },
            "height": {
                get() {
                    return this.y_2 - this.y_1 + 1;
                },
                set(h) {
                    this.y_2 = this.y_1 + h - 1;
                }
            }
        });
    };

    Rect.prototype.isValid = function() {
        return this.x_1 < this.x_2 && this.y_1 < this.y_2;
    };

    Rect.prototype.isIntersectWith = function(rect) {
        if (!this.isValid() || !rect || !rect.isValid()) return false;
        return !(this.x_1 > rect.x_2 || rect.x_1 > this.x_2 ||
            this.y_1 > rect.y_2 || rect.y_1 > this.y_2)
    };

    Rect.prototype.isRectInside = function(rect) {
        return this.isInside(rect.x_1, rect.y1) && this.isInside(rect.x_2, rect.y2)
    }

    Rect.prototype.isInside = function(x, y) {
        return inClosedInterval(x, this.x_1, this.x_2) && inClosedInterval(y, this.y_1, this.y_2);
    };

    function inClosedInterval(v, min, max) {
        return v >= min && v <= max;
    }


    function UndoHistory() {
        this.reverse_index = 0;
        this.undo_history = [];
        this.undo_desc = "Nothing to undo"
        this.redo_desc = "Nothing to redo";
    }

    UndoHistory.prototype.updateDesc = function() {
        let this_command = this.undo_history[length - this.reverse_index - 1];
        this.undo_desc = this_command ? this_command.desc : "Nothing to undo";
        let next_command = this.undo_history[length - this.reverse_index - 1];
        this.redo_desc = next_command ? next_command.desc : "Nothing to redo";
    }

    UndoHistory.prototype.undo = function() {
        let length = this.undo_history.length;
        if (this.reverse_index > length - 1) {
            return;
        }
        let command = this.undo_history[length - this.reverse_index - 1];
        command.undo();
        this.reverse_index++;
        this.updateDesc();
    }

    UndoHistory.prototype.redo = function() {
        if (this.reverse_index == 0) {
            return null;
        }
        let command = this.undo_history[length - this.reverse_index];
        command.redo();
        this.reverse_index--;
        this.updateDesc();
        return command;
    }

    UndoHistory.prototype.addCommand = function(command) {
        this.undo_history.splice(this.undo_history.length - this.reverse_index, this.reverse_index)
        this.undo_history.append(command);
        this.reverse_index = 0;
        this.updateDesc();
    }
    /**
     *
     * @class Scene
     * @constructor
     * @param {HTMLCanvas} canvas required. the canvas where you want to render, if canvas is undefined, then fail.
     * @param {Graph} graph, the content to display
     * @param {Object} options [optional] {drawing_context, rendering_template}
     */
    function Scene(canvas, graph, options) {
        this.assertCanvasValid(canvas);
        this.canvas = canvas;
        canvas.owner = this;
        this.graph = graph || new Graph();
        options = options || {};
        this.drawing_context = options.drawing_context || '2d';
        this.rendering_template = options.rendering_template || RenderingTemplate;
        this.renderer = new Renderer(this);
        this.view = new View(this);
        this.collision_detector = new CollisionDetector();
        this.selected_nodes = {};
        this.command_in_process = undefined;
        this.undo_history = new UndoHistory();
        this.pluginSceneRenderingConfig();
        this.updateBoundingRectInGraph();
        this.setStartRenderWhenCanvasOnFocus();
        this.setStopRenderWhenCanvasOnBlur();
        this.pointer_pos = new Point(0, 0);
        this.pointer_down = null; //pointer means any input devices like mouse, pen, touch surfaces
        this.force_lod = null;
        Object.defineProperty(this, "lod", {
            get() { return this.force_lod != null? this.force_lod:this.view.lod;}
        })
        this.default_height = this.canvas.height;
    };

    Scene.prototype.resize = function(w, h) {
        if(!w ||!h) return;
        if (this.canvas.width == w && this.canvas.height == h) {
            return;
        }
        this.canvas.width = w;
        this.canvas.height = h;
        this.renderer.updateAllLayersSize(w, h);
    }

    Scene.prototype.fitToParentWidth = function() {
        let parent = this.canvas.parentNode;
        let w = parent.offsetWidth;
        if (w) {
            this.resize(w, this.default_height);
        }
    }

    Scene.prototype.fitToParentWidthEvent = function(e) {
        this.fitToParentWidth();
    }

    Scene.prototype.fitToWindowSize = function() {
        let w = document.body.clientWidth;
        let h = document.body.clientHeight;
        if (w && h) {
            this.resize(w, h);
        }
    }

    Scene.prototype.toggleFullScreen = function() {
        if(this.fullscreen){
            this.fitToParentWidth()
        } else{
            this.fitToWindowSize();
        }
        this.fullscreen = !this.fullscreen ;
    }

    Scene.prototype.assertCanvasValid = function(canvas) {
        if (!canvas)
            throw "None object passed as the canvas argument."
        if (canvas.localName != "canvas")
            throw "No-canvas object passed as the canvas argument."
        if (!canvas.getContext)
            throw "This browser doesn't support Canvas";
    }

    Scene.prototype.pluginSceneRenderingConfig = function() {
        this.style = this.rendering_template.scene.style;
        this.style.owner = this;
    }

    Scene.prototype.updateBoundingRectInGraph = function() {
        for (const item of this.graph.getItems()) {
            this.collision_detector.addBoundingRect(item);
        }
    }

    Scene.prototype.setStartRenderWhenCanvasOnFocus = function() {
        this.canvas.addEventListener("focus", this.renderer.startRender());
    };

    Scene.prototype.setStopRenderWhenCanvasOnBlur = function() {
        this.canvas.addEventListener("blur", this.renderer.stopRender());
    };

    Scene.prototype.sceneRect = function() {
        return this.view.sceneRect();
    };

    Scene.prototype.nodes = function() {
        return Object.values(this.graph.nodes);
    };

    Scene.prototype.visibleNodes = function() {
        let sceneRect = this.sceneRect();
        return this.collision_detector.getItemsOverlapWith(sceneRect, Node)
    };

    Scene.prototype.deselectNode = function(node, not_to_redraw) {
        if (!this.isNodeValid(node))
            return;
        node.deselected();
        delete this.selected_nodes[node.id];
        if (!not_to_redraw)
            this.setToRender("nodes");
    };

    Scene.prototype.deselectNodes = function(nodes, not_to_redraw) {
        for (let node of nodes) {
            this.deselectNode(node, true);
        }
        if (!not_to_redraw)
            this.setToRender("nodes");
    };

    Scene.prototype.deselectSelectedNodes = function(not_to_redraw) {
        for (const node of Object.values(this.selected_nodes)) {
            node.deselected();
        }
        this.selected_nodes = {};
        if (!not_to_redraw)
            this.setToRender("nodes");
    };

    Scene.prototype.isNodeValid = function(node) {
        if (!node) {
            console.warn("The node is null");
            return false;
        }
        if (!(node instanceof Node)) {
            console.warn("The ${node} is not the instance of the Node");
            return false;
        }
        return true;
    }

    Scene.prototype.isConnectorValid = function(connector) {
        if (!connector) {
            console.warn("The connector is null");
            return false;
        }
        if (!(connector instanceof Connector)) {
            console.warn("The ${node} is not the instance of the Connector");
            return false;
        }
        return true;
    }

    Scene.prototype.setToRender = function(changes) {
        this.renderer.setToRender(changes);
    };

    Scene.prototype.getSelectedNodes = function() {
        return Object.values(this.selected_nodes);
    }

    Scene.prototype.selectNode = function(node, append_to_selections, not_to_redraw) {
        if (!this.isNodeValid(node))
            return;
        if (!append_to_selections)
            this.deselectSelectedNodes(true);
        if (this.selected_nodes[node.id] == node)
            return;
        node.selected();
        this.selected_nodes[node.id] = node;
        if (!not_to_redraw)
            this.setToRender("nodes");
    };

    Scene.prototype.selectNodes = function(nodes, append_to_selections, not_to_redraw) {
        if (!append_to_selections)
            this.deselectSelectedNodes(true);
        for (let node of nodes) {
            this.selectNode(node, true, true);
        }
        if (!not_to_redraw)
            this.setToRender("nodes");
    };

    Scene.prototype.selectAllNodes = function(not_to_redraw) {
        this.selectNodes(Object.values(this.graph.nodes), not_to_redraw);
    };

    Scene.prototype.toggleNodeSelection = function(node, not_to_redraw) {
        if (!this.isNodeValid(node))
            return;
        node.toggleSelection();
        if (this.selected_nodes[node.id])
            delete this.selected_nodes[node.id];
        else
            this.selected_nodes[node.id] = node;
        if (!not_to_redraw)
            this.setToRender("nodes");
    };

    Scene.prototype.toggleNodesSelection = function(nodes, not_to_redraw) {
        for (let node of nodes) {
            this.toggleNodeSelection(node, true);
        }
        if (!not_to_redraw)
            this.setToRender("nodes");
    };

    Scene.prototype.removeSelectedNodes = function(not_to_redraw) {
        for (const node of Object.values(this.selected_nodes)) {
            this.graph.remove(node)
        }
        this.selected_nodes = {};
        if (!not_to_redraw)
            this.setToRender("nodes");
    };

    Scene.prototype.removeNodes = function(nodes, not_to_redraw) {
        for (const node of nodes) {
            this.deselectNode(node, true);
            this.graph.removeNode(node)
        }
        if (!not_to_redraw)
            this.setToRender("nodes");
    };

    Scene.prototype.addNode = function(node, not_to_redraw) {
        if (!this.isNodeValid(node))
            return
        node.pluginRenderingTemplate(this.rendering_template);
        this.graph.addNode(node);
        this.selectNode(node);
        if (!not_to_redraw)
            this.setToRender("nodes");
    };

    Scene.prototype.addNodes = function(nodes, not_to_redraw) {
        for (const node of nodes) {
            this.addNode(node, true);
        }
        this.selectNodes(nodes)
        if (!not_to_redraw)
            this.setToRender("nodes");
    };

    Scene.prototype.addConnector = function(connector, not_to_redraw) {
        if (!this.isConnectorValid(connector))
            return
        connector.pluginRenderingTemplate(this.rendering_template);
        this.graph.addConnector(connector);
        if (!not_to_redraw)
            this.setToRender("connectors");
    };

    Scene.prototype.addConnectors = function(connectors, not_to_redraw) {
        for (const connector of connectors) {
            this.addConnector(connectors, true);
        }
        if (!not_to_redraw)
            this.setToRender("connectors");
    };

    Scene.prototype.removeConnector = function(connector, not_to_redraw) {
        this.graph.removeConnector(connector);
        if (!not_to_redraw)
            this.setToRender("connectors");
    };

    Scene.prototype.removeConnectors = function(connectors, not_to_redraw) {
        for (const connector of connectors) {
            this.removeConnector(connector, true);
        }
        if (!not_to_redraw)
            this.setToRender("connectors");
    };

    Scene.prototype.copySelectedNodeToClipboard = function() {
        let clipboard_info = {
            nodes: {},
            connectors: [],
            min_x_of_nodes: 0,
            min_y_of_nodes: 0
        };
        for (const node of Object.values(this.selected_nodes)) {
            let new_node = TypeRegistry.cloneNode(node);
            clipboard_info.nodes[node.id] = new_node.serialize();
            clipboard_info.min_x_of_nodes = Math.min(clipboard_info.min_x_of_nodes, new_node.translate.x);
            clipboard_info.min_y_of_nodes = Math.min(clipboard_info.min_y_of_nodes, new_node.translate.y);
            //if the connected nodes of this node are also selected, then copy the connector between them
            let connectors = this.graph.allOutConnectorsOf(node.id);
            for (const connector of connectors) {
                if (this.selected_nodes[connector.in_node.id])
                    clipboard_info.connectors.push(connector.serialize());
            }
        };
        localStorage.setItem("visual_programming_env_clipboard", JSON.stringify(clipboard_info));
    };

    Scene.prototype.pasteFromClipboard = function(config) {
        let created = {
            "nodes": [],
            "connectors": []
        };
        config = config || localStorage.getItem("visual_programming_env_clipboard");
        if (!config) {
            return created;
        }
        let clipboard_info = JSON.parse(config);
        let new_nodes = {};
        for (const [old_id, node_config] of Object.entries(clipboard_info.nodes)) {
            let node = TypeRegistry.createNode(node_config.type);
            if (!node) continue;
            node.configure(node_config);
            //paste in last known mouse position
            node.translate.add(this.pointer_pos.x - config.min_x_of_nodes, this.pointer_pos.y - config.min_y_of_nodes);
            this.addNode(node);
            created.nodes.append(node);
            new_nodes[old_id] = node;
        }
        for (const connector_config of clipboard_info.connectors) {
            if (!new_nodes[connector_config[1]] || !new_nodes[connector_config[3]]) continue;
            let connector = new Connector(connector_config[0], new_nodes[connector_config[1]], connector_config[2],
                new_nodes[connector_config[3]], connector_config[4]);
            this.addConnector(connector);
            created.connectors.append(connector);
        }
        this.selectNodes(Object.values(new_nodes));
        return created;
    };

    Scene.prototype.cutSelectedNodes = function() {
        this.copySelectedNodeToClipboard();
        this.removeSelectedNodes();
    }

    Scene.prototype.duplicateSelectedNodes = function() {
        this.copySelectedNodeToClipboard();
        this.pasteFromClipboard();
    };

    Scene.prototype.connectors = function() {
        return Object.values(this.graph.connectors);
    };

    Scene.prototype.getConnectorsLinkedToNodes = function(nodes) {
        this.graph.getConnectorsLinkedToNodes(nodes);
    };

    Scene.prototype.getConnectorsLinkedToSlot = function(node, slot) {
        this.graph.getConnectorsLinkedToSlot(node, slot);
    };

    Scene.prototype.visibleConnectors = function() {
        let sceneRect = this.sceneRect();
        return this.collision_detector.getItemsOverlapWith(sceneRect, Connector)
    };

    Scene.prototype.zoom = function(v, pivot) {
        this.view.setScale(v, pivot)
    };

    Scene.prototype.viewScale = function() {
        return this.view.scale;
    };

    Scene.prototype.pan = function(delta_x, delta_y) {
        this.setCursor('Move');
        this.view.addTranslate(delta_x, delta_y);
    };

    Scene.prototype.draw = function(ctx, lod) {
        if (this.style)
            this.style.draw(ctx, lod);
    };

    Scene.prototype.addSceneCoordinateToEvent = function(e) {
        let pos = this.view.mapToScene(e.offsetX, e.offsetY);
        e.sceneX = pos.x;
        e.sceneY = pos.y;
        e.sceneMovementX = e.sceneX - this.pointer_pos.x;
        e.sceneMovementY = e.sceneY - this.pointer_pos.y;
        this.pointer_pos.x = e.sceneX;
        this.pointer_pos.y = e.sceneY;
    }

    Scene.prototype.execCommand = function(command, args) {
        this.command_in_process = command;
        this.command_in_process.exec.apply(args);
        if (!command.update)
            this.endCommand(args);
    }

    Scene.prototype.endCommand = function(args) {
        this.command_in_process.end.apply(args);
        this.undo_history.addCommand(this.command_in_process);
        this.command_in_process = null;
    }

    Scene.prototype.undo = function() {
        this.undo_history.undo();
    }

    Scene.prototype.redo = function() {
        this.undo_history.redo();
    }

    Scene.prototype.setCursor = function(cursor) {
        this.canvas.style.cursor = cursor;
    }

    Scene.prototype.inView = function(x, y) {
        return this.view.viewport.isInside(x, y);
    }
    /**
     * When left mouse button press on the canvas without hit the widgets, context, just bind event to Scene
     * If hit others, just bind unbind event to the scene and bind event to other items
     * Add bindevent to scene callback for other items
     */
    Scene.prototype.bindEventToScene = function() {
        if (this._events_binded)
            return;
        this._keyDown_callback = this.onKeyDown.bind(this);
        this.canvas.addEventListener("keydown", this._keyDown_callback, true);
        this._whell_callback = this.onWheel.bind(this);
        this.canvas.addEventListener("wheel", this._whell_callback, true);
        this._mouseDown_callback = this.onMouseDown.bind(this);
        this.canvas.addEventListener("mousedown", this._mouseDown_callback, true);
        this._mouseMove_callback = this.onMouseMove.bind(this);
        this.canvas.addEventListener("mousemove", this._mouseMove_callback, true);
        this._mouseUp_callback = this.onMouseUp.bind(this);
        this.canvas.addEventListener("mouseup", this._mouseUp_callback, true);
        this._events_binded = true;
    }

    Scene.prototype.unbindEventToScene = function() {
        if (!this._events_binded)
            return;
        this.canvas.removeEventListener("keydown", this._keyDown_callback);
        this._keyDown_callback = null;
        this.canvas.removeEventListener("wheel", this._whell_callback);
        this._whell_callback = null;
        this.canvas.removeEventListener("mousedown", this._mouseDown_callback);
        this._mouseDown_callback = null;
        this.canvas.removeEventListener("mousemove", this._mouseMove_callback);
        this._mouseMove_callback = null;
        this.canvas.removeEventListener("mouseup", this._mouseUp_callback);
        this._mouseUp_callback = null;
        this._events_binded = false;
    }

    Scene.prototype.onKeyDown = function(e) {
        if (e.type == "keydown") {
            if (e.code == 'Escape') {
                this.deselectSelectedNodes();
            }
            if (e.code == 'Delete') {
                let command = new RemoveSelectedNodesCommand(this);
                this.execCommand(command, [e]);
            }
            if (e.code == "KeyA" && e.ctrlKey) {
                this.selectAllNodes();
            }
            if (e.code == "KeyC" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
                this.copySelectedNodeToClipboard();
            }
            if (e.code == "KeyV" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
                let command = new PasteFromClipboardCommand(this);
                this.execCommand(command, [e]);
            }
            if (e.code == "KeyX" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
                let command = new CutSelectedNodesCommand(this);
                this.execCommand(command, [e]);
            }
            if (e.code == "KeyD" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
                let command = new DuplicateNodeCommand(this);
                this.execCommand(command, [e]);
            }
            if (e.code == "ArrowUp" && !(e.metaKey || e.ctrlKey) && !e.shiftKey) {
                NudgetNode(1, 0, this, e);
            }
            if (e.code == "ArrowDown" && !(e.metaKey || e.ctrlKey) && !e.shiftKey) {
                NudgetNode(-1, 0, this, e);
            }
            if (e.code == "ArrowLeft" && !(e.metaKey || e.ctrlKey) && !e.shiftKey) {
                NudgetNode(0, -1, this, e);
            }
            if (e.code == "ArrowShift" && !(e.metaKey || e.ctrlKey) && !e.shiftKey) {
                NudgetNode(0, 1, this, e);
            }
        }
    }

    Scene.prototype.addSceneCoordinateIfHandleMouseEvent = function(e) {
        if (!this.inView(e.offsetX, e.offsetY)) {
            return false;
        }
        this.addSceneCoordinateToEvent(e);
        return true;
    }

    Scene.prototype.leftMouseDownOnSlot = function(e, hit) {
        let connectors = this.getConnectorsLinkedToSlot(hit.hit_node, hit.hit_component);
        if (connectors.length == 0) {
            if (!e.altKey || !e.shiftKey)
                this.execCommand(new ConnectCommand(this), [e, hit.hit_node, hit.hit_component.name]);
            else if (!e.shiftKey) {
                if (e.altKey) {
                    this.execCommand(new RemoveConnectorCommand(this), [e, connectors]);
                    return;
                }
                if (e.ctrlKey) {
                    this.execCommand(new ReconnectCommand(this), [e, connectors, hit.hit_component.isInput()]);
                }
            }
        }
    }

    Scene.prototype.leftMouseDownOnNode = function(e, hit) {
        let border = whichBorder(hit.hit_local_x, hit.hit_local_y, hit.hit_node);
        if (hit.hit_node.allow_resize && border)
            this.execCommand(new ResizeCommand(this, hit.hit_node), [e, border]);
        else if (hit.hit_component instanceof Node) {
            this.leftMouseDownOnSlot(e, hit);
        }
    }

    Scene.prototype.leftMouseDownOnScene = function(e) {
        this.execCommand(new MarqueeSelectionCommand(this), [e])
        this.bindEventToScene();
    }

    Scene.prototype.leftMouseUp = function(e, hit) {
        if (hit.is_hitted) {
            if (hit.hit_component)
                console.log('hit on slot');
            if (e.ctrlKey && !e.shiftKey)
                this.toggleNodeSelection(hit.hit_node);
            this.selectNode(hit.hit_node, e.shiftKey);
        }
        this.deselectSelectedNodes();
    }

    Scene.prototype.rightMouseUp = function(e, hit) {
        //todo context menu
    }

    Scene.prototype.onWheel = function(e) {
        if (!this.addSceneCoordinateIfHandleMouseEvent(e))
            return;
        let delta = e.deltaY * -0.01;
        this.zoom(this.viewScale() + delta, new Point(e.sceneX, e.sceneY));
    }

    Scene.prototype.moveAndUpEventsToDocument = function() {
        //move mouse move event to the window in case it drags outside of the canvas
        this.canvas.removeEventListener("mousemove", this._mouseMove_callback);
        this.getDocument().addEventListener("mousemove", this._mouseMove_callback, true);
        this.getDocument().addEventListener("mouseup", this._mouseUp_callback, true);
    }

    Scene.prototype.moveAndUpEventsToScene = function() {
        //restore the mousemove event back to the canvas
        this.canvas.addEventListener("mousemove", this._mouseMove_callback, true);
        this.getDocument().removeEventListener("mousemove", this._mouseMove_callback);
        this.getDocument().removeEventListener("mouseup", this._mouseMove_callback);
    }

    Scene.prototype.onMouseDown = function(e) {
        if (!this.addSceneCoordinateIfHandleMouseEvent(e))
            return;
        this.moveAndUpEventsToDocument();
        this.pointer_down = e.button;
        if (!this.hit_result)
            this.hit_result = this.collision_detector.getHitResultAtPos(e.sceneX, e.sceneY);
        if (e.button == 0) {
            if (!this.hit_result.is_hitted || !this.hit_result.hit_node)
                this.leftMouseDownOnScene(e);
            else
                this.leftMouseDownOnNode(e, this.hit_result);
        }
        e.preventDefault();
    }

    Scene.prototype.mouseHover = function(e) {
        this.hit_result = this.collision_detector.getHitResultAtPos(e.sceneX, e.sceneY);
        if (this.hit_result.is_hitted) {
            this.hit_result.hit_node.mouseEnter();
            if (this.hit_result.hit_component) {
                this.hit_result.hit_component.mouseEnter();
                return;
            }
            let border = whichBorder(this.hit_result.hit_local_x, this.hit_result.hit_local_y, this.hit_result.hit_node);
            if (this.hit_result.hit_node.allow_resize && border) {
                let cursor = mapNodeBorderToCursor[border] || "all-scroll";
                this.setCursor(cursor);
            }
        }
    }

    Scene.prototype.onMouseMove = function(e) {
        this.addSceneCoordinateToEvent(e);
        if (this.command_in_process)
            this.command_in_process.update(e);
        else if (!this.pointer_down)
            this.mouseHover(e);
        else if (this.pointer_down == 0)
            this.execCommand(new MoveCommand(this), [e, this.hit_result.hit_node]);
        else if (this.pointer_down == 2)
            this.pan(e.sceneMovementX, e.sceneMovementY);
        e.preventDefault();
    }

    Scene.prototype.onMouseUp = function(e) {
        this.focus_node = this.pointer_down = null;
        this.moveAndUpEventsToScene();
        if (this.command_in_process) {
            this.endCommand([e]);
            return;
        }
        if (!this.hit_result)
            this.hit_result = this.collision_detector.getHitResultAtPos(e.sceneX, e.sceneY);
        if (e.button == 0)
            this.leftMouseUp(e, this.hit_result);
        else if (e.button == 2)
            this.rightMouseUp(e, this.hit_result);
        e.preventDefault();
    }

    Scene.prototype.getDocument = function() {
        return this.canvas.ownerDocument;
    };

    function NudgetNode(delta_x, delta_y, scene, e) {
        let command = new MoveCommand(this);
        command.desc = 'Nudge Node';
        e.sceneMovementX = 1;
        e.sceneMovementY = 0;
        scene.execCommand(command, [e]);
    }

    function Command() {}

    Command.prototype.desc = "Abstract command";
    Command.prototype.support_undo = true;
    Command.prototype.start_state = null;
    Command.prototype.end_state = null;
    Command.prototype.exec = function(e) {}
    Command.prototype.update = undefined;
    Command.prototype.end = function(e) {}
    Command.prototype.draw = function(ctx) {}
    Command.prototype.undo = function() {}
    Command.prototype.redo = function() {}

    function MoveCommand(scene) {
        this.desc = "Move Node";
        this.scene = scene;
    }

    MoveCommand.prototype.exec = function(e) {
        this.start_state = [];
        for (const node of Object.values(this.scene.selected_nodes)) {
            this.start_state.append(node.translate);
        }
    }
    MoveCommand.prototype.update = function(e) {
        for (const node of Object.values(this.scene.selected_nodes)) {
            node.addTranslate(e.sceneMovementX, e.sceneMovementY)
        }
        this.scene.setToRender("nodes");
    }

    MoveCommand.prototype.end = function(e) {
        this.update(e);
        this.end_state = [];
        for (const node of Object.values(this.scene.selected_nodes)) {
            this.end_state.append(node.translate);
        }
    }
    MoveCommand.prototype.undo = function() {
        let index = 0;
        for (const node of Object.values(this.scene.selected_nodes)) {
            node.translate = this.start_state[index];
            index++;
        }
    }
    MoveCommand.prototype.redo = function() {
        let index = 0;
        for (const node of Object.values(this.scene.selected_nodes)) {
            node.translate = this.end_state[index];
            index++;
        }
    }

    Object.setPrototypeOf(MoveCommand.prototype, Command.prototype);

    const NodeBorder = {
        top: "top",
        bottom: "bottom",
        left: "left",
        right: "right",
        top_left: "top_left",
        top_right: "top_right",
        bottom_left: "bottom_left",
        bottom_right: "bottom_right",
    }

    function whichBorder(x, y, node) {
        let vertical = x < 1 ? "left" : x > node.width - 1 ? "right" : null;
        let horizontal = y < 1 ? "top" : y > node.height - 1 ? "bottom" : null;
        let border_name = (horizontal ? "" : horizontal + "_") + (vertical ? "" : vertical);
        return NodeBorder[border_name];
    }

    let mapNodeBorderToCursor = {
        "top": "ns-resize",
        "bottom": "ns-resize",
        "left": "ew-resize",
        "right": "ew-resize",
        "top_left": "ne",
        "top-right": "nw",
        "bottom_left": "sw",
        "bottom_right": "se"
    }

    function ResizeCommand(scene, resized_node) {
        this.desc = "Resize Node";
        this.scene = scene;
        this.resized_node = resized_node;
    }

    ResizeCommand.prototype.exec = function(e, node_border) {
        this.node_border = node_border;
        let cursor = mapNodeBorderToCursor[this.node_border] || "all-scroll";
        this.scene.setCursor(cursor);
        this.start_state = [this.resized_node.translate, this.resized_node.width(), this.resized_node.height()];
    }

    ResizeCommand.prototype.update = function(e) {
        e.sceneMovementX = e.sceneMovementY = 1;
        switch (this.node_border) {
            case NodeBorder.top:
                this.resized_node.addTranslate(0, e.sceneMovementY);
                break;
            case NodeBorder.bottom:
                this.resized_node.setHeight(this.resized_node.height() + e.sceneMovementY);
                break;
            case NodeBorder.left:
                this.resized_node.setWidth(this.resized_node.width() + e.sceneMovementX);
                break;
            case NodeBorder.right:
                this.resized_node.addTranslate(e.sceneMovementX, 0);
                break;
            case NodeBorder.top_left:
                this.resized_node.addTranslate(0, e.sceneMovementY);
                this.resized_node.setWidth(this.resized_node.width() + e.sceneMovementX);
                break;
            case NodeBorder.top_right:
                this.resized_node.addTranslate(0, e.sceneMovementY);
                this.resized_node.setHeight(this.resized_node.height() + e.sceneMovementY);
                break;
            case NodeBorder.bottom_left:
                this.resized_node.addTranslate(e.sceneMovementX, 0);
                this.resized_node.setWidth(this.resized_node.width() + e.sceneMovementX);
                break;
            case NodeBorder.bottom_right:
                this.resized_node.setWidth(this.resized_node.width() + e.sceneMovementX);
                this.resized_node.setHeight(this.resized_node.height() + e.sceneMovementY);
                break;
        }
        this.scene.setToRender("nodes");
    }

    ResizeCommand.prototype.end = function(e) {
        this.update(e);
        this.end_state = [this.resized_node.translate, this.resized_node.width(), this.resized_node.height()];
        this.scene.setCursor('default');
    }

    ResizeCommand.prototype.undo = function() {
        this.resized_node.translate = this.start_state[0];
        this.resized_node.setWidth(this.start_state[1]);
        this.resized_node.setHeight(this.start_state[2]);
    }

    ResizeCommand.prototype.redo = function() {
        this.resized_node.translate = this.end_state[0];
        this.resized_node.setWidth(this.end_state[1]);
        this.resized_node.setHeight(this.end_state[2]);
    }

    Object.setPrototypeOf(ResizeCommand.prototype, Command.prototype);

    function MarqueeSelectionCommand(scene) {
        this.desc = "Select Nodes";
        this.scene = scene;
        this.support_undo = false;
        this.select_rect = new Rect(0, 0, 0, 0);
    }

    MarqueeSelectionCommand.prototype.exec = function(e) {
        this.select_rect.x = e.sceneX;
        this.select_rect.y = e.sceneY;
    }

    MarqueeSelectionCommand.prototype.update = function(e) {
        this.end_pos = new Point(e.sceneX, e.sceneY);
        this.select_rect.width = Math.abs(this.select_rect.x - this.end_pos.x),
            this.select_rect.height = Math.abs(this.select_rect.y - this.end_pos.y),
            this.select_rect.x = Math.min(this.select_rect.x - this.end_pos.x);
        this.select_rect.y = Math.min(this.select_rect.y - this.end_pos.y);
        let nodes = this.scene.collision_detector.getItemsOverlapWith(this.select_rect, Node)
        if (e.ctrlKey && !e.shiftKey)
            this.scene.toggleNodesSelection(nodes);
        this.scene.selectNodes(nodes, e.shiftKey);
    }

    MarqueeSelectionCommand.prototype.end = function(e) {
        this.update(e);
    }

    MarqueeSelectionCommand.prototype.draw = function(ctx) {
        ctx.lineWidth = 0.3;
        ctx.setLineDash([0.5, 0.25]);
        ctx.strokeRect(this.select_rect.x, this.select_rect.y, this.select_rect.width, this.select_rect.height);
    }

    Object.setPrototypeOf(MarqueeSelectionCommand.prototype, Command.prototype);

    function ConnectCommand(scene) {
        this.desc = "Create Connector";
        this.scene = scene;
        this.target_node = {
            pos: new Point(0, 0),
            getConnectedAnchorPosInScene: function() {
                return this.target_node.pos
            }
        };
        this.from_node = null;
        this.from_slot = null;
        this.connector = null;
    }

    ConnectCommand.prototype.exec = function(e, from_node, from_slot_name) {
        this.from_node = from_node;
        this.from_slot = from_node.getSlot(from_slot_name);
        this.from_slot.mousePressed();
        this.target_node.pos = new Point(e.sceneX, e.sceneY);
        if (this.from_slot.isInput())
            this.connector = new Connector(null, this.target_node, null, this.from_node, from_slot_name);
        else
            this.connector = new Connector(null, this.from_node, from_slot_name, this.target_node, null);
        this.connector.pluginRenderingTemplate(this.scene.rendering_template);
    }

    ConnectCommand.prototype.update = function(e) {
        this.target_node.resetState();
        this.target_node.pos = new Point(e.sceneX, e.sceneY);
        let hit_result = this.scene.collision_detector.getHitResultAtPos(this.target_node.pos);
        let target_slot = hit_result.hit_component;
        if (target_slot instanceof NodeSlot) {
            let connection = this.from_node.allowConnectTo(this.from_slot.name, hit_result.hit_node, target_slot);
            console.log(connection.desc);
        }
    }

    ConnectCommand.prototype._addConnector = function(target_node, target_slot_name, connection) {
        if (connection.method == SlotConnection.null) {
            console.warn(connection.desc);
            this.support_undo = false;
            return;
        }
        this.end_state = {};
        if (connection.method == SlotConnection.replace) {
            let connector = this.scene.getConnector(this.from_node, this.from_slot.name, target_node, target_slot_name);
            this.scene.removeConnector(connector);
            this.end_state['removed_connector'] = [
                this.connector.out_node, this.connector.out_slot_name,
                this.connector.in_node, this.connector.in_slot_name
            ];
        }
        if (this.from_slot.isInput()) {
            this.connector.out_node = target_node;
            this.connector.out_slot_name = target_slot_name;
        } else {
            this.connector.in_node = target_node;
            this.connector.in_slot_name = target_slot_name;
        }
        this.scene.addConnector(this.connector);
        this.end_state['added_connector'] = [
            this.connector.out_node, this.connector.out_slot_name,
            this.connector.in_node, this.connector.in_slot_name
        ];
        console.log(connection.desc);
    }

    ConnectCommand.prototype.end = function(e) {
        this.target_node.pos = new Point(e.sceneX, e.sceneY);
        let hit_result = this.scene.collision_detector.getHitResultAtPos(this.target_node.pos);
        let target_slot = hit_result.hit_component;
        if (target_slot instanceof NodeSlot) {
            let connection = this.from_node.allowConnectTo(this.from_slot.name, hit_result.hit_node, target_slot);
            this._addConnector(hit_result.hit_node, target_slot.name, connection);
        } else {
            //todo search menu
        }
    }

    ConnectCommand.prototype.draw = function(ctx, lod) {
        if (this.connector)
            this.connector.draw(ctx, lod);
    }

    ConnectCommand.prototype.undo = function() {
        let removed = this.end_state['removed_connector'];
        if (removed)
            this.scene.addConnector(new Connector(null, removed[0], removed[1], removed[2], removed[3]));
        this.scene.removeConnector(this.connector);
    }

    ConnectCommand.prototype.redo = function() {
        let removed = this.end_state['removed_connector'];
        if (removed) {
            let connector = this.scene.getConnector(removed[0], removed[1], removed[2], removed[3]);
            this.scene.removeConnector(connector);
        }
        this.scene.addConnector(this.connector);
    }

    Object.setPrototypeOf(ConnectCommand.prototype, Command.prototype);

    function ReconnectCommand(scene) {
        this.desc = "Create Connector";
        this.scene = scene;
        this.remove_connectors_command = new RemoveConnectorsCommand(this.scene);
        this.add_connector_commands = [];
    }

    ReconnectCommand.prototype.exec = function(e, connectors, change_in_slot) {
        this.remove_connectors_command.exec(e, connectors);
        for (const connector of connectors) {
            let command = new ConnectCommand(this.scene);
            command.exec(e,
                change_in_slot ? connector.out_node : connector.in_node,
                change_in_slot ? connector.out_slot_name : connector.in_slot_name);
            this.add_connector_commands.append(command);
        }
    }

    ReconnectCommand.prototype.update = function(e) {
        for (const command of this.add_connector_commands) {
            command.update(e)
        }
    }

    ReconnectCommand.prototype.end = function(e) {
        for (const command of this.add_connector_commands) {
            command.end(e)
        }
    }

    ReconnectCommand.prototype.undo = function() {
        for (const command of this.add_connector_commands) {
            command.undo()
        }
        this.remove_connectors_command.undo();
    }

    ReconnectCommand.prototype.redo = function() {
        for (const command of this.add_connector_commands) {
            command.redo()
        }
        this.remove_connectors_command.redo();
    }

    Object.setPrototypeOf(ReconnectCommand.prototype, Command.prototype);

    function AddNodeCommand(scene) {
        this.desc = "Add Node";
        this.scene = scene;
    }

    /**
     *
     * @param e
     * @param node
     * @param connector the connector will also be created when drag the connector and create node from context menu
     */
    AddNodeCommand.prototype.exec = function(e, node, connector) {
        this.scene.addNode(node);
        if (connector)
            this.scene.addConnector(connector);
        this.end_state = {
            'node': node,
            'connector': connector
        };
    }

    AddNodeCommand.prototype.undo = function() {
        this.scene.removeNode(this.end_state['node']);
        if (this.end_state['connector'])
            this.scene.removeConnector(this.end_state['connector']);
    }

    AddNodeCommand.prototype.redo = function() {
        this.exec(null, this.end_state['node'], this.end_state['connector']);
    }

    Object.setPrototypeOf(AddNodeCommand.prototype, Command.prototype);

    function AddConnectorCommand(scene) {
        this.desc = "Add Connector";
        this.scene = scene;
    }

    AddConnectorCommand.prototype.exec = function(e, connector) {
        this.scene.addConnector(connector);
        this.end_state = connector;
    }

    AddConnectorCommand.prototype.undo = function() {
        this.scene.removeConnector(this.end_state);
    }

    AddConnectorCommand.prototype.redo = function() {
        this.exec(null, this.end_state);
    }

    Object.setPrototypeOf(AddConnectorCommand.prototype, Command.prototype);

    function RemoveConnectorCommand(scene) {
        this.desc = "Remove Connector";
        this.scene = scene;
    }

    RemoveConnectorCommand.prototype.exec = function(e, connector) {
        this.scene.removeConnector(connector);
        this.end_state = connector;
    }

    RemoveConnectorCommand.prototype.undo = function() {
        this.scene.addConnector(this.end_state);
    }

    RemoveConnectorCommand.prototype.redo = function() {
        this.exec(null, this.end_state);
    }

    Object.setPrototypeOf(RemoveConnectorCommand.prototype, Command.prototype);

    function RemoveSelectedNodesCommand(scene) {
        this.desc = "Delete current selections";
        this.scene = scene;
    }

    RemoveSelectedNodesCommand.prototype.exec = function(e) {
        this.end_state = {
            "nodes": this.scene.getSelectedNodes(),
            "connectors": this.scene.getConnectorsLinkedToNodes(this.scene.getSelectedNodes())
        }
        this.scene.removeSelectedNodes();
    }

    RemoveSelectedNodesCommand.prototype.undo = function() {
        this.scene.addNodes(this.end_state.nodes);
        this.scene.addConnectors(this.end_state.connectors)
    }

    RemoveSelectedNodesCommand.prototype.redo = function() {
        this.scene.removeNodes(this.end_state.nodes);
        this.scene.removeConnectors(this.end_state.connectors);
    }

    function RemoveConnectorsCommand(scene) {
        this.desc = "Delete connectors";
        this.scene = scene;
    }

    RemoveConnectorsCommand.prototype.exec = function(e, connectors) {
        this.end_state = connectors;
        this.scene.removeConnectors(connectors);
    }

    RemoveConnectorsCommand.prototype.undo = function() {
        this.scene.addConnectors(this.end_state)
    }

    RemoveConnectorsCommand.prototype.redo = function() {
        this.exec(null, this.end_state);
    }

    Object.setPrototypeOf(RemoveConnectorsCommand.prototype, Command.prototype);

    function PasteFromClipboardCommand(scene) {
        this.desc = "Paste clipboard contents";
        this.scene = scene;
    }

    PasteFromClipboardCommand.prototype.exec = function(e) {
        this.end_state = {
            "config": localStorage.getItem("visual_programming_env_clipboard")
        };
        if (!this.end_state.config) {
            this.support_undo = false;
            return;
        }
        let created = this.scene.pasteFromClipboard();
        this.end_state.nodes = created.nodes;
        this.end_state.connectors = created.connectors;
    }

    PasteFromClipboardCommand.prototype.undo = function() {
        this.scene.removeNodes(this.end_state.nodes);
        this.scene.removeConnector(this.end_state.connectors);
    }

    PasteFromClipboardCommand.prototype.redo = function() {
        this.scene.pasteFromClipboard(this.end_state.config);
    }

    Object.setPrototypeOf(PasteFromClipboardCommand.prototype, Command.prototype);

    function CutSelectedNodesCommand(scene) {
        this.scene = scene;
        this.delete_command = new RemoveSelectedNodesCommand(this.scene);
        this.desc = this.delete_command.desc;
    }

    CutSelectedNodesCommand.prototype.exec = function(e) {
        this.scene.copySelectedNodeToClipboard();
        this.delete_command.exec(e);
    }

    CutSelectedNodesCommand.prototype.undo = function() {
        this.delete_command.undo();
    }

    CutSelectedNodesCommand.prototype.redo = function() {
        this.delete_command.redo();
    }

    Object.setPrototypeOf(CutSelectedNodesCommand.prototype, Command.prototype);

    function DuplicateNodeCommand(scene) {
        this.scene = scene;
        this.paste_command = new PasteFromClipboardCommand(this.scene);
        this.desc = this.paste_command.desc;
    }

    DuplicateNodeCommand.prototype.exec = function(e) {
        this.scene.copySelectedNodeToClipboard();
        this.paste_command.exec(e);
    }

    DuplicateNodeCommand.prototype.undo = function() {
        this.paste_command.undo();
    }

    DuplicateNodeCommand.prototype.redo = function() {
        this.paste_command.redo();
    }

    Object.setPrototypeOf(DuplicateNodeCommand.prototype, Command.prototype);

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
        this.max_scale = 1;
        this.min_scale = 0.5;
        Object.defineProperty(this, "lod", {
            get() {return this.scale > (this.max_scale + this.min_scale) / 2.0 ? 0 : 1;}
        })
        Object.defineProperty(this, "viewport", {
            get() {return new Rect(0, 0, this.canvas().width, this.canvas().height);}
        })
    }
    View.prototype.canvas = function (){
        return this.scene.canvas;
    }

    View.prototype.scale_pivot = function (){
       return new Point(this.canvas.width / 2, this.canvas.height / 2);
    }

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
            right_bottom_p.x - left_top_p.x + 1, right_bottom_p.y - left_top_p.y + 1);
    };

    /**
     * Returns the mapped scene coordinate point from view coordinates.
     * @param {Point} p scene coordinate
     * @returns {Point} return the point in view coordinate
     */
    View.prototype.mapFromScene = function(p) {
        return new Point((p.x + this.translate.x) * this.scale, (p.y + this.translate.y) * this.scale);
    };

    View.prototype.addTranslate = function(dx_in_scene, dy_in_scene) {
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

    View.prototype.setScale = function(s, pivot_in_view) {
        s = Math.max(this.min_scale, s);
        s = Math.min(this.max_scale, s);
        if (s == this.scale) return;
        if (this.scale < s)
            this.scene.setCursor('zoom in');
        else if (this.scale > s)
            this.scene.setCursor('zoom out');
        // keep the pivot point unchanged after scale
        pivot_in_view = pivot_in_view || this.scale_pivot();
        let pivot_before_scale = this.mapToScene(pivot_in_view);
        this.scale = s;
        if (Math.abs(this.scale - 1) < 0.01) this.scale = 1;
        let pivot_after_scale = this.mapToScene(pivot_in_view);
        this.addTranslate(pivot_after_scale.x - pivot_before_scale.x, pivot_after_scale.y - pivot_after_scale.y);
    };

    //the area of the scene visualized by this view
    View.prototype.sceneRect = function() {
        return this.mapRectToScene(this.viewport);
    };

    function HitResult(is_hitted, hit_node, hit_local_x, hit_local_y, hit_component) {
        this.is_hitted = is_hitted;
        this.hit_node = hit_node;
        this.hit_local_x = hit_local_x;
        this.hit_local_y = hit_local_y;
        this.hit_component = hit_component;
    };

    /**
     * The collision detector will be a part of scene, so all are in scene coordinate.
     * class CollisionDetector
     * @constructor
     */
    function CollisionDetector() {
        this._boundingRects = {};
    };

    CollisionDetector.prototype.clear = function() {
        this._boundingRects = {};
    };

    CollisionDetector.prototype.addBoundingRect = function(item) {
        if (!item) {
            console.warn("None object will not added for collision detection");
            return;
        }
        let rect = item.getBoundingRect();
        if (!rect) {
            console.warn("The ${item} do not have bounding rectangle for collision detection");
            return;
        }
        if (!rect.isValid()) {
            console.warn("The ${item} has invalid bounding rectangle for collision detection");
            return;
        }
        rect.owner = item;
        if (Object.keys(this._boundingRects).includes(rect.owner.id))
            throw "The id of bounding rect already in used."
        this._boundingRects[rect.owner.id] = rect;
    };

    CollisionDetector.prototype.removeBoundingRect = function(owner_id) {
        delete this._boundingRects[owner_id];
    };

    CollisionDetector.prototype.updateBoundingRect = function(item) {
        this.removeBoundingRect(item.id);
        this.addBoundingRect(item)
    };

    CollisionDetector.prototype.getHitResultAtPos = function(x, y) {
        for (const rect of Object.values(this._boundingRects)) {
            if (rect.isInside(x, y)) {
                const local_pos = new Point(x - rect.x, y - rect.y);
                const hit_component = this.getHitComponentAtPos(local_pos.x, local_pos.y, rect.owner);
                return new HitResult(true, rect.owner, local_pos[0], local_pos[1], hit_component);
            }
        }
        return new HitResult(false);
    }

    CollisionDetector.prototype.getHitComponentAtPos = function(x, y, item) {
        for (const comp of item.collidable_components) {
            if (comp.getBoundingRect().isInside(x, y)) {
                return comp;
            }
        }
        return null;
    };

    CollisionDetector.prototype.getItemsOverlapWith = function(rect, type) {
        let intersections = [];
        for (const r of Object.values(this._boundingRects)) {
            let is_this_type = type ? r.owner instanceof type : true;
            if (is_this_type && rect.isIntersectWith(r.getBoundingRect())) {
                intersections.push(r.owner);
            }
        }
        return intersections;
    }

    CollisionDetector.prototype.getItemsInside = function(rect, type) {
        let insides = [];
        for (const r of Object.values(this._boundingRects)) {
            let is_this_type = type ? r.owner instanceof type : true;
            if (is_this_type && rect.isRectInside(r.getBoundingRect())) {
                insides.push(r.owner);
            }
        }
        return insides;
    }

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

            if (radius === 0) {
                this.rect(x, y, w, h);
                return;
            }

            if (radius_low === undefined)
                radius_low = radius;

            //make it compatible with official one
            if (radius != null && radius.constructor === Array) {
                if (radius.length == 1)
                    top_left_radius = top_right_radius = bottom_left_radius = bottom_right_radius = radius[0];
                else if (radius.length == 2) {
                    top_left_radius = bottom_right_radius = radius[0];
                    top_right_radius = bottom_left_radius = radius[1];
                } else if (radius.length == 4) {
                    top_left_radius = radius[0];
                    top_right_radius = radius[1];
                    bottom_left_radius = radius[2];
                    bottom_right_radius = radius[3];
                } else
                    return;
            } else //old using numbers
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
    } //if

    function distance(a, b) {
        return Math.sqrt(
            (b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])
        );
    }

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
})(this);

if (typeof exports != "undefined") {
    exports.Scene = Scene;
}

//import './nodes/scipy.js'
(function(global) {
    let TypeRegistry = global.TypeRegistry;

    function ImageIOImRead() {
        this.addOutput("image", "numpy.ndarray");
    }

    ImageIOImRead.title = "Image Read";
    ImageIOImRead.type = "Image.Read";
    ImageIOImRead.desc = "Reads an image from the specified file. Returns a numpy array," +
        "which comes with a dict of meta data at its ‘meta’ attribute.";
    TypeRegistry.registerNodeType(ImageIOImRead);

    function ImageIOImWrite() {
        this.addInput("image", "numpy.ndarray")
    }

    ImageIOImWrite.title = "Image Write";
    ImageIOImWrite.type = "Image.Write";
    ImageIOImWrite.desc = "Write an image to the specified file.";
    TypeRegistry.registerNodeType(ImageIOImWrite);

    function ImageShow() {
        this.addInput("image", "numpy.ndarray")
    }

    ImageShow.title = "Image Show";
    ImageShow.type = "Image.Show";
    ImageShow.desc = "Show an image.";
    TypeRegistry.registerNodeType(ImageShow);

    function ImageGaussianFilter() {
        this.addInput("input", "numpy.ndarray");
        this.addInput("sigma", "number");
        this.addOutput("output", "numpy.ndarray");
    }

    ImageGaussianFilter.title = "Gaussian Filter";
    ImageGaussianFilter.type = "Image.GaussianFilter";
    ImageGaussianFilter.desc = "Gaussian filter";
    TypeRegistry.registerNodeType(ImageGaussianFilter);
})(this);