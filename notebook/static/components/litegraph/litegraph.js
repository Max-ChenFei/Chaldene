//*********************************************************************************
// Renderer: multiple layers rendering using offscreen canvas
// Collision detection: the scene will generate one bounding rect for each item inside
// for quick detection. Each item can also override collision detection method (`isCollided`)
//*********************************************************************************\
(function(global) {
    let type_registry = new TypeRegistry();
    global.VPE = {
        DEBUG: true,
        TypeRegistry: type_registry,
        Scene: Scene,
    };
    function debug_log(msg) {
        if(global.VPE.DEBUG)
            console.log(msg);
    }
    function deepCopy(obj) {
        if (!obj) return null;
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * TypeRegistry is the class that supports nodes types register, unregister, search.
     *
     * @class TypeRegistry
     */
    function TypeRegistry() {
        this.registered_node_types = {}; // type_name: node_type
    }

    TypeRegistry.prototype.registerNodeType = function(type, node_class) {
        if (!node_class.prototype) {
            throw "Cannot register a simple object, it must be a class with a prototype";
        }
        Object.setPrototypeOf(node_class.prototype, Node.prototype);

        if (!node_class.title) {
            node_class.title = node_class.name;
        }
        let already_registered = this.registered_node_types[type];
        if (already_registered) console.warn("replacing node type: " + type);
        this.registered_node_types[type] = node_class;
    };

    TypeRegistry.prototype.getNodeTypesInAllCategories = function(from_node, from_slot) {
        let categories = {};
        for (const [node_type, node_constructor] of Object.entries(this.registered_node_types)) {
            let path = node_type.split(".");
            console.log(path);
            this.addToCategories(path, categories, from_node, from_slot, node_constructor);
        }
        return categories;
    };

    TypeRegistry.prototype.addToCategories = function(path, categories, from_node, from_slot, to_node_type){
        if(path.length <= 1){
            if(!from_node || from_node.allowConnectToAnySlot(from_slot.name, to_node_type))
                categories[path[0]] = to_node_type;
                return;
        }
        else{
            if(!(categories[path[0]]))
                categories[path[0]] = {};
            //this marks that the object is a category, and not a node
            categories[path[0]].__is_category = true;
            this.addToCategories(path.slice(1), categories[path[0]], from_node, from_slot, to_node_type);
        }
    };

    TypeRegistry.prototype.unregisterNodeType = function(type) {
        let node_class = type.constructor === String ? this.registered_node_types[type] : type;
        if (!node_class)
            throw ("node type not found: " + type);
        delete this.registered_node_types[node_class.type];
    };

    TypeRegistry.prototype.createNode = function(type_name) {
        let node_class = this.registered_node_types[type_name];
        if (!node_class) {
            console.warn(`Can not create node with type ${type_name}`);
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

    TypeRegistry.prototype.getNodeTypesByNameFilter = function(name_filter) {
        name_filter = name_filter ? name_filter : "";
        let node_classes = [];
        for (const node_class of Object.values(this.registered_node_types)) {
            if (node_class.name.includes(name_filter))
                node_classes.push(node_class);
        }
        return node_classes;
    };

    TypeRegistry.prototype.clearRegisteredTypes = function() {
        this.registered_node_types = {};
        this.node_types_in_categories = {};
    };

    TypeRegistry.prototype.isDataTypeMatch = function(type_a, type_b) {
        if(type_a == DataType.Wild || type_b == DataType.Wild)
            return true;
        return type_a == type_b;
    };

    function assertNameUniqueIn(name, obj) {
        if (name in obj) {
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
            let node = type_registry.createNode(node_config.type);
            if (!node) continue;
            node.configure(node_config);
            this.nodes[node.id] = node;
            this.next_unique_id = Math.max(node.id+1, this.next_unique_id);
        }
        for (const connector_config of config.connectors) {
            let connector = new Connector(connector_config[0], this.nodes[connector_config[1]], connector_config[2],
                this.nodes[connector_config[3]], connector_config[4]);
            this.connectors[connector.id] = connector;
            this.next_unique_id = Math.max(connector.id+1, this.next_unique_id);
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
        return [a, b];
    }

    Graph.prototype.getConnector = function(from_node, from_slot_name, to_node, to_slot_name) {
        if (!from_node || !from_slot_name || !to_node || !to_slot_name ||
            !from_node.getSlot(from_slot_name) || !to_node.getSlot(to_slot_name)) {
            console.warn("Can not get the connector of null");
            return null;
        }
        for (const connector of Object.values(this.connectors)) {
            if ((connector.out_node == from_node && connector.out_slot_name == from_slot_name &&
                connector.in_node == to_node && connector.in_slot_name == to_slot_name) ||
                (connector.out_node == to_node && connector.out_slot_name == to_slot_name &&
                connector.in_node == from_node && connector.in_slot_name == from_slot_name)) {
                return connector;
            }
        }
        console.warn("Can not find a connector");
        return null;
    }

    Graph.prototype.getUniqueId = function() {
        return this.next_unique_id++;
    };

    Graph.prototype.clear = function() {
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

    Graph.prototype.addNode = function(node) {
        if (!this.isNodeValid(node))
            return false;
        node.id = this.getUniqueId();
        this.nodes[node.id] = node;
        return true;
    };

    Graph.prototype.addConnector = function(connector) {
        if (!connector) {
            console.warn("None is passed as the connector parameter");
            return false;
        }
        connector.id = this.getUniqueId();
        this.connectors[connector.id] = connector;
        let out_node = connector.out_node;
        let in_node = connector.in_node;
        if (out_node && in_node) {
            let in_slot = in_node.getSlot(connector.in_slot_name);
            let connection = out_node.allowConnectTo(connector.out_slot_name, in_node, in_slot);
            if (connection.method == SlotConnectionMethod.replace) {
                let as_output = connection.args.node == out_node;
                let connectors = this.getConnectorsLinkedToSlot(connection.args.node, connection.args.slot, as_output);
                this.removeConnector(connectors[0]);
            }
            if(connection.method == SlotConnectionMethod.replace || connection.method == SlotConnectionMethod.add){
                out_node.addConnectionOfOutput(connector.out_slot_name);
                in_node.addConnectionOfInput(connector.in_slot_name);
                return true;
            }
        }
        return false;
    };

    Graph.prototype.allOutConnectorsOf = function(node_id) {
        let out = [];
        for (const connector of Object.values(this.connectors)) {
            if (connector.out_node.id == node_id)
                out.push(connector);
        }
        return out;
    };

    Graph.prototype.removeConnector = function(connector) {
        if (!connector || !this.connectors[connector.id]) {
            console.warn("The connector is not existed");
            return false;
        }
        let out_node = connector.out_node;
        if (out_node) out_node.breakConnectionOfOutput(connector.out_slot_name);
        let in_node = connector.in_node;
        if (in_node) in_node.breakConnectionOfInput(connector.in_slot_name);
        delete this.connectors[connector.id];
        return true;
    };

    Graph.prototype.removeConnectors = function(connectors) {
        let did = false;
        for (const connector of connectors) {
            did = this.removeConnector(connector) || did;
        }
        return did;
    };

    Graph.prototype.getConnectorsLinkedToNodes = function(nodes) {
        let connectors = [];
        let nodes_id = [];
        for (const node of nodes) {
            nodes_id.push(node.id);
        }
        for (const connector of Object.values(this.connectors)) {
            if (nodes_id.includes(connector.out_node.id) || nodes_id.includes(connector.in_node.id)) {
                connectors.push(connector);
            }
        }
        return connectors;
    }

    Graph.prototype.getConnectorsLinkedToSlot = function(node, slot, as_output) {
        let connectors = [];
        let both = as_output == undefined || as_output == null;
        for (const connector of Object.values(this.connectors)) {
            if(both || as_output){
                if(node.id == connector.out_node.id && slot.name == connector.out_slot_name)
                    connectors.push(connector);
            }
            if(both || (!as_output)){
                if(node.id == connector.in_node.id && slot.name == connector.in_slot_name)
                    connectors.push(connector);
            }
        }
        return connectors;
    }

    Graph.prototype.clearConnectorsOfNode = function(node) {
        let connectors = this.getConnectorsLinkedToNodes([node]);
        this.removeConnectors(connectors);
        node.clearAllConnections();
    };

    Graph.prototype.removeNode = function(node) {
        if (!this.isNodeValid(node))
            return false;
        if(!this.nodes[node.id])
            return false;
        this.clearConnectorsOfNode(node);
        delete this.nodes[node.id];
        return true;
    };

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

    Graph.prototype.addVarTo = function(name, type, value, obj) {
        assertNameUniqueIn(name, Object.keys(this.inputs));
        assertNameUniqueIn(name, Object.keys(this.outputs));
        assertNameUniqueIn(name, Object.keys(this.local_vars));
        let v = new Variable(name, type, value);
        obj[name] = v;
    };

    Graph.prototype.addInput = function(name, type, value) {
        this.addVarTo(name, type, value, this.inputs);
    };

    Graph.prototype.addOutput = function(name, type, value) {
        this.addVarTo(name, type, value, this.outputs);
    };

    Graph.prototype.addLocalVar = function(name, type, value) {
        this.addVarTo(name, type, value, this.local_vars);
    };

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
        for (const [name, value] of Object.entries(template)) {
            this[name] = value;
        }
    }

    Connector.prototype.draw = function(ctx, lod) {
        if (!this.style) return;
        let that = this;
        let current_style = this.style[this.current_state]
        current_style.draw.call(that, ctx, current_style.ctx_style, lod);
    }

    Connector.prototype.fromPos = function() {
        if (!this.out_node) return new Point(0, 0);
        return this.out_node.getConnectedAnchorPosInScene(this.out_slot_name, true);
    };

    Connector.prototype.toPos = function() {
        if (!this.in_node) return new Point(0, 0);
        return this.in_node.getConnectedAnchorPosInScene(this.in_slot_name, false);
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
        let x_padding = 0;
        let y_padding = 0;
        if(from.x == to.x)
            x_padding = this.detect_distance || 2;
        if(from.y == to.y)
            y_padding = this.detect_distance  || 2;
        return new Rect(
            x - x_padding, y - y_padding,
            Math.abs(from.x - to.x) + 2 * x_padding, Math.abs(from.y - to.y) + 2 * y_padding);
    }

    Connector.prototype.mouseEnter = function() {
        this.current_state = VisualState.hovered;
    };

    Connector.prototype.mouseLeave = function() {
        this.current_state = VisualState.normal;
    };

    const DataType = {
        Wild: "*",
        Exec: "exec",
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

    function areMultipleValuesInArray(values, array) {
        return values.every(s => {
            return array.includes(s)
        });
    }

    function isSlotPosMatch(t_a, t_b) {
        if(t_a == '*' || t_b == '*')
            return true;
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


    function SlotConnection(method, desc, args) {
        this.method = method;
        this.desc = desc;
        this.args = args;
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
     * @param {String} data_type
     * @param {String} default_value: value when the slot type is data_in or data_out
     */
    function NodeSlot(name, slot_pos, data_type, default_value) {
        this.name = name;
        this.slot_pos = slot_pos;
        this.data_type = data_type;
        this.default_value = default_value;
        this.connections = 0;
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
        this.current_state = VisualState.hovered;
    };

    NodeSlot.prototype.isInput = function() {
        return this.slot_pos == SlotPos.exec_in || this.slot_pos == SlotPos.data_in;
    }

    NodeSlot.prototype.isConnected = function() {
        return this.connections > 0;
    };

    NodeSlot.prototype.allowConnectTo = function(other_slot) {
        if (!isSlotPosMatch(this.slot_pos, other_slot.slot_pos))
            return new SlotConnection(SlotConnectionMethod.null,
                `${this.slot_pos} is not compatible with ${other_slot.slot_pos}`);
        if (!type_registry.isDataTypeMatch(this.data_type, other_slot.data_type))
            return new SlotConnection(SlotConnectionMethod.null,
                `${this.data_type} is not compatible with ${other_slot.data_type}`);
        if (this.isConnected() && !this.allowMultipleConnections()) {
            return new SlotConnection(SlotConnectionMethod.replace,
                'Replace the existing connections', {slot:this});
        }
        let as_input = this.isInput();
        if (other_slot.isConnected(as_input) && !other_slot.allowMultipleConnections(as_input)) {
            return new SlotConnection(SlotConnectionMethod.replace,
                'Replace the existing connections', {slot:other_slot});
        }
        return new SlotConnection(SlotConnectionMethod.add, 'Add a connection');
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
        return this.slot_pos == SlotPos.exec_in || this.slot_pos == SlotPos.data_out;
    };

    NodeSlot.prototype.pluginRenderingTemplate = function(template) {
        for (const [name, value] of Object.entries(template)) {
            this[name] = value;
        }
        this.updateStyleForNewType();
    };

    NodeSlot.prototype.getBoundingRect = function() {
        const size = this.size();
        return new Rect(this.translate.x + size.left, this.translate.y + size.top, size.width, size.height);
    };

    NodeSlot.prototype.updateStyleForNewType = function(){
        let default_style = this.style['default']
        this.type_style = this.style[this.data_type];
        if (this.type_style) {
            Object.setPrototypeOf(this.type_style, default_style);
        } else {
            this.type_style = default_style;
        }
    };

    NodeSlot.prototype.getCurrentStyle = function() {
        const connected_state = this.isConnected() ? "connected" : "unconnected";
        return this.type_style[connected_state][this.current_state];
    }

    NodeSlot.prototype.draw = function(ctx, lod) {
        let current_style = this.getCurrentStyle();
        let that = this;
        current_style.draw.call(that, ctx, current_style.ctx_style, lod);
    }

    NodeSlot.prototype.getCtxStyle = function(){
        return this.getCurrentStyle().ctx_style;
    };

     /**
     * Wild Node slot, input or output
     */
    function WildNodeSlot(data_type) {
        this.data_type = data_type || "*";
        this.slot_pos = data_type || "*";
        this.name = 'wildslot';
        //[in connections, out connections]
        this.connections = [0, 0];
        this.current_state = VisualState.normal;
        this.translate = new Point(0, 0);
    };

    WildNodeSlot.prototype.setDataType = function (new_type){
        this.data_type = new_type;
        this.updateStyleForNewType();
    }

    WildNodeSlot.prototype.isInput = function(to_slot) {
        if(to_slot == undefined)
            return undefined;
        else if(to_slot instanceof WildNodeSlot)
            return false
        else
            return !to_slot.isInput();
    }

    WildNodeSlot.prototype.isConnected = function(as_output) {
        if(as_output == undefined)
            return this.connections[0] > 0 && this.connections[1] > 0;
        return this.connections[+as_output] > 0;
    };

    WildNodeSlot.prototype.allowConnectTo = function(other_slot) {
        if (!type_registry.isDataTypeMatch(this.data_type, other_slot.data_type))
            return new SlotConnection(SlotConnectionMethod.null,
                `${this.data_type} is not compatible with ${other_slot.data_type}`);
        let as_output = !this.isInput(other_slot);
        if (this.isConnected(as_output) && !this.allowMultipleConnections(as_output)) {
            return new SlotConnection(SlotConnectionMethod.replace,
                'Replace the existing connections', {slot:this});
        }
        if (other_slot.isConnected(!as_output) && !other_slot.allowMultipleConnections(!as_output)) {
            return new SlotConnection(SlotConnectionMethod.replace,
                'Replace the existing connections', {slot:other_slot});
        }
        return new SlotConnection(SlotConnectionMethod.add, 'Add a connection');
    };

    WildNodeSlot.prototype.addConnection = function(as_output) {
        if (this.allowMultipleConnections(as_output)) {
            this.connections[+as_output] += 1;
        } else {
            this.connections[+as_output] = 1;
        }
    };

    WildNodeSlot.prototype.breakConnection = function(as_output) {
        if (this.connections[+as_output] > 0)
            this.connections[+as_output] -= 1;
        if(this.connections[0] == 0 && this.connections[1] == 0 && this.data_type != "*"){
            this.data_type = "*";
            this.updateStyleForNewType();
        };
    };

    WildNodeSlot.prototype.clearConnections = function() {
        this.connections = [0, 0];
    };

    WildNodeSlot.prototype.allowMultipleConnections = function(as_output) {
        if(as_output){
            return this.data_type != DataType.Exec
        }
        else{
            return this.data_type == DataType.Exec
        }
    };

    Object.setPrototypeOf(WildNodeSlot.prototype, NodeSlot.prototype);

    const VisualState = {
        normal: "normal",
        hovered: "hovered",
        selected: "selected"
    }

    function Node() {
        this._ctor();
    }

    Node.prototype._ctor = function() {
        this.id = undefined;
        this.title = undefined;
        this.type = "*";
        this.desc = "";
        this.inputs = {};
        this.outputs = {};
        this.allow_resize = false;
        this.translate = undefined;
        this.scale = undefined;
        this.collidable_components = {};
        this.current_state = VisualState.normal;
        this.lod = 0;
    }

    Node.prototype.allSlots = function() {
        return Object.values(this.inputs).concat(Object.values(this.outputs));
    }

    Node.prototype.serialize = function() {
        let o = {
            id: this.id,
            type: this.type,
            translate: [this.translate.x, this.translate.y],
            connections: []
        };
        for (const slot of this.allSlots()) {
            o["connections"].push(slot.connections)
        }
        return o;
    }

    Node.prototype.configure = function(config) {
        if (!config)
            return;
        this.id = config.id;
        this.translate = new Point(config.translate[0], config.translate[1]);
        let i = 0;
        for (const slot of this.allSlots()) {
            slot.connections = config.connections[i];
            i++;
        }
    }

    Node.prototype.getSlotCtxStyle = function(slot_name){
      let slot = this.getSlot(slot_name);
      return slot.getCtxStyle();
    };

    Node.prototype.getTitle = function() {
        return this.title || this.constructor.title;
    };

    Node.prototype.getConnectedAnchorPosInScene = function(slot_name, as_output) {
        const slot = this.getSlot(slot_name);
        if (!slot) return undefined;
        let local_pos = slot.getConnectedAnchorPos(as_output);
        return new Point(this.translate.x + local_pos.x, this.translate.y + local_pos.y);
    };

    /**
     * add a new slot to slots
     * @method addInput
     * @param {string} slot_name
     * @param {SlotPos} slot_pos
     * @param {string} data_type string defining the input type ("vec3","number",...), it its a generic one use *
     * @param {string} default_value
     * @param {Array} slots
     */
    Node.prototype.addSlotTo = function(slot_name, slot_pos, data_type, default_value, slots) {
        assertNameUniqueIn(slot_name, Object.keys(this.inputs));
        assertNameUniqueIn(slot_name, Object.keys(this.outputs));
        let slot = new NodeSlot(slot_name, slot_pos, data_type, default_value);
        slots[slot_name] = slot;
        this.collidable_components[slot_name] = slot;
    };

    /**
     * add a new input slot to use in this node
     * @method addInput
     * @param {string} slot_name
     * @param {string} type string defining the input type ("vec3","number",...), it its a generic one use *
     * @param {string} default_value
     */
    Node.prototype.addInput = function(slot_name, type, default_value) {
        const slot_pos = type === DataType.Exec ? SlotPos.exec_in : SlotPos.data_in;
        this.addSlotTo(slot_name, slot_pos, type, default_value, this.inputs);
    };

    /**
     * add a new output slot to use in this node
     * @method addOutput
     * @param {string} slot_name
     * @param {string} type string defining the output type ("vec3","number",...)
     */
    Node.prototype.addOutput = function(slot_name, type) {
        const slot_pos = type === DataType.Exec ? SlotPos.exec_out : SlotPos.data_out;
        this.addSlotTo(slot_name, slot_pos, type, undefined, this.outputs);
    };

    Node.prototype.addInputs = function(inputs) {
        for (const input of inputs) {
            this.addInput(input.name, input.type, default_value)
        }
    };

    Node.prototype.addOutputs = function(outputs) {
        for (const output of outputs) {
            this.addOutput(output.name, output.type)
        }
    };

    Node.prototype.removeSlotFrom = function(slot_name, slots) {
        delete this.collidable_components[slot_name];
        delete slots[slot_name];
    };

    Node.prototype.removeInput = function(slot_name) {
        this.removeSlotFrom(slot_name, this.inputs);
    };

    Node.prototype.removeOutput = function(slot_name) {
        this.removeSlotFrom(slot_name, this.outputs);
    };

    Node.prototype.getSlot = function(slot_name) {
        return this.inputs[slot_name] || this.outputs[slot_name];
    };

    Node.prototype.allowConnectTo = function(slot_name, to_node, to_slot) {
        let slot = this.getSlot(slot_name);
        if (!slot || !to_node || !to_slot) {
            return new SlotConnection(SlotConnectionMethod.null, 'Some input parameters are undefined.');
        }

        if (this == to_node) {
            return new SlotConnection(SlotConnectionMethod.null, 'Both are on the same node.');
        }
        let connection = slot.allowConnectTo(to_slot);
        if(connection.method == SlotConnectionMethod.replace){
            let node = connection.args.slot == slot? this : to_node;
            connection.args['node'] = node;
        }
        return connection;
    };

    Node.prototype.allowConnectToAnySlot = function(slot_name, to_node) {
        let slot = this.getSlot(slot_name);
        if (!slot || !to_node) {
            return false;
        }

        if (this == to_node) {
            return false;
        }
        let to_slots = [];
        if(slot.isInput() == undefined){
            return true;
        }
        if(slot.isInput()){
           to_slots = Object.values(to_node.outputs);
        }
        else{
           to_slots = Object.values(to_node.inputs);
        }
        for(const out_slot of to_slots){
            if(slot.allowConnectTo(out_slot) != SlotConnectionMethod.null)
                return true;
        }
        return false;
    };

    /**
     * add a connection to the slot. The connector is not recored because the slot can be connected only when the node is added to the graph that will
     * manage how to connect, access to the connectors and nodes.
     * @method connect
     * @param {String} slot_name
     */
    Node.prototype.addConnectionOf = function(slot, as_output) {
        if (!slot) {
            return;
        }
        slot.addConnection(as_output)
    };

    Node.prototype.addConnectionOfInput = function(slot_name) {
        this.addConnectionOf(this.getSlot(slot_name), false)
    };

    Node.prototype.addConnectionOfOutput = function(slot_name) {
        this.addConnectionOf(this.getSlot(slot_name), true)
    };

    Node.prototype.breakConnectionOf = function(slot, as_output) {
        if (!slot) {
            return;
        }
        slot.breakConnection(as_output);
    };

    Node.prototype.breakConnectionOfOutput = function(slot_name) {
        this.breakConnectionOf(this.getSlot(slot_name), true);
    };

    Node.prototype.breakConnectionOfInput = function(slot_name) {
        this.breakConnectionOf(this.getSlot(slot_name), false)
    };

    Node.prototype.clearConnectionsOf = function(slot) {
        if (!slot) {
            return;
        }
        slot.clearConnections()
    };

    Node.prototype.clearInConnections = function() {
        for (let slot of Object.values(this.inputs)) {
            this.clearConnectionsOf(slot)
        }
    };

    Node.prototype.clearOutConnections = function() {
        for (let slot of Object.values(this.outputs)) {
            this.clearConnectionsOf(slot)
        }
    };

    Node.prototype.clearAllConnections = function() {
        this.clearInConnections();
        this.clearOutConnections();
    };

    Node.prototype.addTranslate = function(delta_x, delta_y) {
        this.translate.add(delta_x, delta_y);
    };

    Node.prototype.getBoundingRect = function() {
        const size = this.size();
        return new Rect(this.translate.x + size.left, this.translate.y + size.top, size.width, size.height);
    };

    Node.prototype.draw = function(ctx, lod) {
        if (!this.style) return;
        let state_style = this.style[this.current_state];
        let that = this;
        state_style.draw.call(that, ctx, state_style.ctx_style, lod);
    };

    Node.prototype.overrideRenderingTemplate = function() {
    };

    Node.prototype.overrideRenderingTemplateOfSlot = function(slot) {
    };

    Node.prototype.pluginRenderingTemplate = function(template) {
        let default_node = template['Node'];
        for (const [name, value] of Object.entries(default_node))
            this[name] = value;
        let this_node = template[this.constructor.name];
        if (this_node){
            for (const [name, value] of Object.entries(this_node))
                this[name] = value;
        }
        this.overrideRenderingTemplate();
        for (const slot of this.allSlots()) {
            slot.pluginRenderingTemplate(template['NodeSlot']);
            this.overrideRenderingTemplateOfSlot(slot);
        }
        if(this.allSlots().length > 0)
            this.setSlotsTranslation();
    }

    Node.prototype.mouseEnter = function() {
        //this.current_state = VisualState.hovered;
    };

    Node.prototype.mouseLeave = function() {
        //this.current_state = VisualState.normal;
    };

    Node.prototype.isSelected = function() {
        return this.current_state == VisualState.selected;
    }

    Node.prototype.selected = function() {
        if (this.isSelected())
            return;
        this.current_state = VisualState.selected;
    }

    Node.prototype.deselected = function() {
        if (!this.isSelected())
            return;
        this.current_state = VisualState.normal;
    }

    Node.prototype.toggleSelection = function() {
        if (this.isSelected())
            this.current_state = VisualState.normal;
        else
            this.current_state = VisualState.selected;
    }

    Node.prototype.pressed = function() {
        this.current_state = VisualState.selected;
    };

    function RerouteNode(data_type) {
        this._ctor();
        this.title = "RerouteNode";
        this.type = "RerouteNode";
        this.desc = "Reroute Node";
        this.slot = new WildNodeSlot(data_type);
        this.slot_name = 'wildslot';
        this.collidable_components = {};
        this.collidable_components[this.slot_name] = this.slot;
    }

    RerouteNode.prototype.allSlots = function(){
        return [this.slot];
    }

    RerouteNode.prototype.getSlot = function(){
        return this.slot;
    }

    RerouteNode.prototype.allowConnectTo = function(slot_name, to_node, to_slot) {
        if (!to_node || !to_slot) {
            return new SlotConnection(SlotConnectionMethod.null, 'Some input parameters are undefined.');
        }
        if (this == to_node) {
            return new SlotConnection(SlotConnectionMethod.null, 'Both are on the same node.');
        }
        let connection = this.slot.allowConnectTo(to_slot);
        if(connection.method == SlotConnectionMethod.replace){
            let node = connection.args.slot == this.slot? this : to_node;
            connection.args['node'] = node;
        }
        return connection;
    };

    RerouteNode.prototype.overrideRenderingTemplateOfSlot = function(slot) {
        slot.to_render_text = false;
    };

    RerouteNode.prototype.clearAllConnections = function() {
       this.slot.clearConnections()
    };

    type_registry.registerNodeType("RerouteNode", RerouteNode);

    function CommentNode() {
        this._ctor();
        this.title = "Comment";
        this.type = "Comment";
        this.desc = "Comment";
        this.allow_resize = true;
        //for resize detection
        this.resize_detection_distance = 4;
        this._width = 200;
        this._height = 200;
        this._min_width = 10;
        this._min_height=10;
    }

    CommentNode.prototype.setWidth = function(w) {
        this._width = Math.max(this._min_width, w);
    };

    CommentNode.prototype.width = function() {
        return this._width;
    };

    CommentNode.prototype.setHeight = function(h) {
         this._height = Math.max(this._min_height, h);
    };

    CommentNode.prototype.height = function() {
        return this._height;
    };

    CommentNode.prototype.size = function() {
        return {left: 0, top: 0, width: this.width(), height: this.height()}
    },

    CommentNode.prototype.pluginRenderingTemplate = function(template) {
        let this_node = template['CommentNode'];
        for (const [name, value] of Object.entries(this_node))
            this[name] = value;
    }

    CommentNode.prototype.getBoundingRect = function() {
        const size = this.size();
        return new Rect(this.translate.x + size.left - this.resize_detection_distance,
            this.translate.y + size.top - this.resize_detection_distance,
            size.width + 2 * this.resize_detection_distance,
            size.height + 2 * this.resize_detection_distance);
    };

    CommentNode.prototype.serialize = function() {
        return {
            id: this.id,
            type: this.type,
            translate: [this.translate.x, this.translate.y],
            width: this.width(),
            height: this.height(),
        };
    }

    CommentNode.prototype.configure = function(config) {
        if (!config)
            return;
        this.id = config.id;
        this.translate = new Point(config.translate[0], config.translate[1]);
        this.setWidth(config.width || 0);
        this.setHeight(config.height || 0);
    }

    type_registry.registerNodeType("Comment", CommentNode);

    function textWidth(text, font) {
        let canvas = document.getElementsByTagName("canvas")[0];
        let ctx = canvas.getContext("2d");
        ctx.save();
        ctx.font = font;
        let text_width = ctx.measureText(text).width;
        ctx.restore();
        return text_width;
    }

    let RenderingTemplate = {
        name: "RenderingTemplate",
        scene: {
            style: {
                "0": {
                    image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkAQMAAABKLAcXAAAABlBMVEXMysz8/vzemT50AAAAIklEQVQ4jWNgQAH197///Q8lPtCdN+qWUbeMumXULSPALQDs8NiOERuTbAAAAABJRU5ErkJggg==",
                    image_repetition: "repeat",
                    global_alpha: 1,
                    fill_color: null
                },
                "1": {
                    global_alpha: 1,
                    fill_color: '#ffffff'
                },
            }
        },
        // different slot data types(number, string..), different states style sheet(selected, unselected, hovered) applied on
        // different LOD of shape
        NodeSlot: {
            icon_width: 10,
            icon_height: 10,
            to_render_text: true,
            font: '12px Arial',
            margin_between_icon_text: 3,
            width: function() {
                let text_width = (this.to_render_text && this.data_type != 'exec') ? textWidth(this.name, this.font) : 0;
                return this.icon_width + (text_width > 0 ? this.margin_between_icon_text + text_width : 0);
            },
            height: function() {
                return this.icon_height;
            },
            getConnectedAnchorPos: function(as_output) {
                let pos = {};
                let wild_slot = this.isInput() == undefined;
                if(wild_slot)
                    pos.x = as_output * this.icon_width +　this.translate.x;
                else
                    pos.x = this.translate.x;
                pos.y = this.icon_height / 2.0 + this.translate.y
                return pos;
            },
            size: function() {
                let is_input = this.isInput() == undefined? true : this.isInput();
                let x = is_input ? 0 : -this.width();
                return {left: x, top: 0, width: this.width(), height: this.height()};
            },
            style: {
                "default": {
                    unconnected: {
                        normal: {
                            ctx_style: {
                                fillStyle: null,
                                strokeStyle: "#84ff00",
                                lineWidth: 2,
                                fontStyle: "000000FF",
                            },
                            draw: function(ctx, ctx_style, lod) {
                                this.type_style._draw_when_normal.call(this, ctx, ctx_style, lod);
                            }
                        },
                        hovered: {
                            ctx_style: {
                                fillStyle: null,
                                strokeStyle: "#84ff00",
                                lineWidth: 5,
                                fontStyle: "000000FF",
                            },
                            draw: function(ctx, ctx_style, lod) {
                                this.type_style._draw_when_hovered.call(this, ctx, ctx_style, lod);
                            }
                        }
                    },
                    connected: {
                        normal: {
                            ctx_style: {
                                fillStyle: "#84ff00",
                                strokeStyle: "#84ff00",
                                lineWidth: 2,
                                fontStyle: "000000FF",
                            },
                            draw: function(ctx, ctx_style, lod) {
                                this.type_style._draw_when_normal.call(this, ctx, ctx_style, lod);
                            }
                        },
                        hovered: {
                            ctx_style: {
                                fillStyle: "#84ff00",
                                strokeStyle: "#84ff00",
                                lineWidth: 5,
                                fontStyle: "000000FF",
                            },
                            draw: function(ctx, ctx_style, lod) {
                                this.type_style._draw_when_hovered.call(this, ctx, ctx_style, lod);
                            }
                        },
                    },
                    _draw_when_normal: function(ctx, ctx_style, lod) {
                        this.type_style._drawShape.call(this, ctx, ctx_style, lod);
                        if (lod == 0 && this.to_render_text && this.data_type != 'exec') {
                            this.type_style._drawName.call(this, ctx, ctx_style);
                        }
                    },
                    _draw_when_hovered: function(ctx, ctx_style, lod) {
                        this.type_style._draw_when_normal.call(this, ctx, ctx_style, lod);
                        // if (lod == 0)
                        //     this.type_style.hovered(ctx, ctx_style);
                    },
                    _drawShape: function(ctx, style, lod) {
                        ctx.save();
                        if (style.fillStyle) {
                            ctx.fillStyle = style.fillStyle;
                        }
                        if (style.strokeStyle) {
                            ctx.lineWidth = style.lineWidth;
                            ctx.strokeStyle = style.strokeStyle;
                        }
                        let is_input = this.isInput() == undefined? true : this.isInput();
                        if(lod > 0){
                            if (style.fillStyle)
                                ctx.fillRect((is_input-1) * this.icon_width, 0, this.icon_width, this.icon_height);
                            ctx.strokeRect((is_input-1) * this.icon_width, 0, this.icon_width, this.icon_height);
                        }
                        else{
                            ctx.beginPath();
                            ctx.arc(
                                this.icon_width / 2.0 + (is_input-1) * this.icon_width,
                                this.icon_width / 2.0,
                                this.icon_width / 2.0, 0, Math.PI * 2, true);
                            ctx.closePath();
                            if (style.fillStyle) {
                                ctx.fill();
                            }
                            if (style.strokeStyle) {
                                ctx.stroke();
                            }
                        }
                        ctx.restore();
                    },
                    _drawName: function(ctx, style) {
                        ctx.save();
                        ctx.font = this.font;
                        if (style.fontStyle) ctx.fillStyle = style.fontStyle;
                        ctx.textBaseline = "middle";
                        let x = 0;
                        if (this.isInput()) {
                            ctx.textAlign = "left";
                            x = this.icon_width + this.margin_between_icon_text;
                        } else {
                            ctx.textAlign = "right";
                            x = -(this.icon_width + this.margin_between_icon_text);
                        }
                        ctx.fillText(this.name, x, this.icon_height / 2.0);
                        ctx.restore();
                    },
                    _hovered: function(ctx, style) {
                        ctx.globalAlpha = 0.6;
                        if (style.fillStyle)
                            ctx.fillStyle = style.fillStyle;
                        if(this.isInput())
                            ctx.fillRect(0, 0, this.width(), this.height());
                        else
                            ctx.fillRect(-this.width(), 0, this.width(), this.height());
                        ctx.globalAlpha = 1;
                    },
                },
                "exec": {
                    unconnected: {
                        normal: {
                            ctx_style: {
                                fillStyle: null,
                                strokeStyle: "#f33232",
                                line_width:2
                            },
                            draw: function(ctx, ctx_style, lod) {
                                this.type_style._draw_when_normal.call(this, ctx, ctx_style, lod);
                            }
                        },
                        hovered: {
                            ctx_style: {
                                fillStyle: null,
                                strokeStyle: "#f33232",
                                line_width:2
                            },
                            draw: function(ctx, ctx_style, lod) {
                                this.type_style._draw_when_hovered.call(this, ctx, ctx_style, lod);
                            }
                        },
                    },
                    connected: {
                        normal: {
                            ctx_style: {
                                fillStyle: "#f33232",
                                strokeStyle: "#f33232",
                                line_width:2
                            },
                            draw: function(ctx, ctx_style, lod) {
                                this.type_style._draw_when_normal.call(this, ctx, ctx_style, lod);
                            }
                        },
                        hovered: {
                            ctx_style: {
                                fillStyle: "#bf00ff",
                                strokeStyle: "#363015",
                                line_width:5
                            },
                            draw: function(ctx, ctx_style, lod) {
                                this.type_style._draw_when_hovered.call(this, ctx, ctx_style, lod);
                            }
                        },
                    },
                    _drawShape: function(ctx, style, lod) {
                        ctx.save();
                        let start_x = 0;
                        let is_input = this.isInput() == undefined? true : this.isInput();
                        if (!is_input)
                            start_x = - this.icon_width;
                        if (style.fillStyle) {
                            ctx.fillStyle = style.fillStyle;
                        }
                        if (style.strokeStyle) {
                            ctx.lineWidth = style.lineWidth;
                            ctx.strokeStyle = style.strokeStyle;
                        }
                        if(lod > 0){
                            if (style.fillStyle)
                                ctx.fillRect(start_x, 0, this.icon_width, this.icon_height);
                            ctx.strokeRect((is_input-1) * this.icon_width, 0, this.icon_width, this.icon_height);
                        }
                        else {
                            ctx.beginPath();
                            ctx.moveTo(start_x, 0);
                            ctx.lineTo(this.icon_width / 2.0 + start_x, 0);
                            ctx.lineTo(this.icon_width + start_x, this.icon_height / 2.0);
                            ctx.lineTo(this.icon_width / 2.0 + start_x, this.icon_height);
                            ctx.lineTo(start_x, this.icon_height);
                            ctx.closePath();
                            if (style.fillStyle)
                                ctx.fill();
                            if (style.strokeStyle)
                                ctx.stroke();
                            ctx.moveTo(0, 0);
                        }
                        ctx.restore();
                    },
                },
                "number": {
                    unconnected: {
                        normal: {
                            ctx_style: {
                                fillStyle: null,
                                strokeStyle: "#cc00ff"
                            },
                            draw: function(ctx, ctx_style, lod) {
                                this.type_style._draw_when_normal.call(this, ctx, ctx_style, lod);
                            }
                        },
                        hovered: {
                            ctx_style: {
                                fillStyle: null,
                                strokeStyle: "#cc00ff"
                            },
                            draw: function(ctx, ctx_style, lod) {
                                this.type_style._draw_when_hovered.call(this, ctx, ctx_style, lod);
                            }
                        },
                    },
                    connected: {
                        normal: {
                            ctx_style: {
                                fillStyle: "#cc00ff",
                                strokeStyle: "#cc00ff",
                            },
                            draw: function(ctx, ctx_style, lod) {
                                this.type_style._draw_when_normal.call(this, ctx, ctx_style, lod);
                            }
                        },
                        hovered: {
                            ctx_style: {
                                fillStyle: "#cc00ff",
                                strokeStyle: "#cc00ff"
                            },
                            draw: function(ctx, ctx_style, lod) {
                                this.type_style._draw_when_hovered.call(this, ctx, ctx_style, lod);
                            }
                        },
                    },
                },
                "numpy.ndarray": {
                    unconnected: {
                        normal: {
                            ctx_style: {
                                fillStyle: null,
                                strokeStyle: "#00b2ff",
                                lineWidth: 2,
                            },
                            draw: function(ctx, ctx_style, lod) {
                                this.type_style._draw_when_normal.call(this, ctx, ctx_style, lod);
                            }
                        },
                        hovered: {
                            ctx_style: {
                                fillStyle: null,
                                strokeStyle: "#00b2ff",
                                lineWidth: 5,
                            },
                            draw: function(ctx, ctx_style, lod) {
                                this.type_style._draw_when_hovered.call(this, ctx, ctx_style, lod);
                            }
                        },
                    },
                    connected: {
                        normal: {
                            ctx_style: {
                                fillStyle: "#00b2ff",
                                strokeStyle: "#00b2ff",
                                lineWidth: 2,
                            },
                            draw: function(ctx, ctx_style, lod) {
                                this.type_style._draw_when_normal.call(this, ctx, ctx_style, lod);
                            }
                        },
                        hovered: {
                            ctx_style: {
                                fillStyle: "#00b2ff",
                                strokeStyle: "#00b2ff",
                                lineWidth: 5,
                            },
                            draw: function(ctx, ctx_style, lod) {
                                this.type_style._draw_when_hovered.call(this, ctx, ctx_style, lod);
                            }
                        },
                    },
                },
            }
        },
        Node: {
            title_bar: {
                to_render: true,
                color: "#a3a3fa",
                height: 25,
                font: "12px Arial",
                font_color: '#000000',
                text_to_border: 5
            },
            central_text: {
                to_render: false,
                width: 10,
                color: "#000000"
            },
            slot_to_top_border: 6,
            slot_to_side_border: 6,
            slot_margin_right: 20,
            slot_margin_bottom: 10,
            width: function() {
                const input_slots = Object.values(this.inputs);
                const output_slots = Object.values(this.outputs);
                let max_line_width = 0;
                for (let i = 0; i < Math.max(input_slots.length, output_slots.length); i++) {
                    let width = (input_slots[i]? input_slots[i].width() : 0 ) + (output_slots[i]? output_slots[i].width() : 0 );
                    max_line_width = Math.max(max_line_width, width);
                }
                max_line_width += this.slot_to_side_border * 2;
                if (this.central_text.to_render)
                    max_line_width += this.central_text.width;
                else
                    max_line_width += this.slot_margin_right;
                max_line_width = Math.max(max_line_width,
                    textWidth(this.title, this.title_bar.font) + this.title_bar.text_to_border * 2);
                return max_line_width;
            },
            height: function() {
                let left_side = this.slot_to_side_border * 2;
                for (const input of Object.values(this.inputs)) {
                    left_side += input.height();
                }
                left_side += this.slot_margin_bottom * Math.max((Object.values(this.inputs).length - 1), 0);
                let right_side = this.slot_to_side_border * 2;
                for (const output of Object.values(this.outputs)) {
                    right_side += output.height();
                }
                right_side += this.slot_margin_bottom * Math.max((Object.values(this.outputs).length - 1), 0);
                let central_text_height = (this.central_text.to_render || 0) * (this.central_text.height || 0);
                return Math.max(left_side, right_side, central_text_height) + this.title_bar.to_render * this.title_bar.height;
            },
            size: function() {
                let y = this.title_bar.to_render ? -this.title_bar.height : 0;
                return {left: 0, top: y, width: this.width(), height: this.height()}
            },
            style: {
                normal: {
                    ctx_style: {
                        fill_style: "#b6b6b6",
                        stroke_style: "#2b2b2b",
                        line_width: 1,
                        round_radius: 8
                    },
                    draw: function(ctx, ctx_style, lod) {
                        this._draw.call(this, ctx, ctx_style, lod);
                    }
                },
                hovered: {
                    ctx_style: {
                        fill_style: "#ffcf00",
                        stroke_style: "#0053FFFF",
                        line_width: 1,
                        round_radius: 8
                    },
                    draw: function(ctx, ctx_style, lod) {
                        this._draw.call(this, ctx, ctx_style, lod);
                    }
                },
                selected: {
                    ctx_style: {
                        fill_style: "#b6b6b6",
                        stroke_style: "#ffcc00",
                        line_width: 3,
                        round_radius: 8
                    },
                   draw: function(ctx, ctx_style, lod) {
                        this._draw.call(this, ctx, ctx_style, lod);
                    }
                },
            },
            setSlotsTranslation: function(){
                let index = 1;
                let next_slot_y = this.slot_to_top_border;
                for (let slot of Object.values(this.inputs)) {
                    slot.translate.x = this.slot_to_side_border;
                    slot.translate.y = next_slot_y;
                    next_slot_y = next_slot_y + slot.height() +　this.slot_margin_bottom;
                    index++;
                }
                index = 1;
                next_slot_y = this.slot_to_top_border;
                for (let slot of Object.values(this.outputs)) {
                    slot.translate.x = this.width() - this.slot_to_side_border;
                    slot.translate.y = next_slot_y;
                    next_slot_y = next_slot_y + slot.height() +　this.slot_margin_bottom;
                    index++;
                }
            },
            _draw: function(ctx, ctx_style, lod) {
                this._drawBackground(ctx, ctx_style, lod);
                this._drawTitle(ctx, ctx_style, lod);
                this._drawSlots(ctx, lod);
                this._drawCentral(ctx, ctx_style, lod);
            },

            _drawBackground: function(ctx, ctx_style, lod) {
                ctx.save();
                if (ctx_style.fill_style)
                    ctx.fillStyle = ctx_style.fill_style;
                if (ctx_style.stroke_style) {
                    ctx.strokeStyle = ctx_style.stroke_style;
                    ctx.lineWidth = ctx_style.line_width;
                }
                const rect = this.size();
                if(lod > 0) {
                    ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
                    ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
                }
                else{
                    ctx.beginPath();
                    ctx.roundRect(rect.left, rect.top, rect.width, rect.height, [ctx_style.round_radius]);
                    ctx.fill();
                    if (ctx_style.stroke_style) {
                    ctx.stroke();
                    }
                }
                ctx.restore();
            },

            _drawTitle: function(ctx, ctx_style, lod) {
                if (!this.title_bar.to_render)
                    return;
                ctx.save();
                ctx.fillStyle = this.title_bar.color;
                const rect = this.size();
                let inner_offset = ctx_style.line_width / 2.0 || 0;
                if (lod > 0) {
                    ctx.fillRect(
                        rect.left + inner_offset, rect.top + inner_offset,
                        rect.width- 2* inner_offset, this.title_bar.height- 2* inner_offset);
                } else {
                    ctx.beginPath();
                    ctx.roundRect(
                        rect.left + inner_offset,
                        rect.top + inner_offset,
                        rect.width - 2* inner_offset,
                        this.title_bar.height -2* inner_offset,
                        ctx_style.round_radius, 3);
                    ctx.fill();
                    ctx.font = this.title_bar.font;
                    ctx.fillStyle = this.title_bar.font_color;
                    ctx.textBaseline = "middle";
                    ctx.textAlign = "left";
                    ctx.fillText(this.title, this.title_bar.text_to_border, - this.title_bar.height / 2.0);
                }
                ctx.restore();
            },

            _drawSlots: function(ctx, lod) {
                for (const slot of this.allSlots()) {
                    ctx.save();
                    ctx.translate(slot.translate.x, slot.translate.y);
                    slot.draw(ctx, lod);
                    ctx.restore();
                }
            },

            _drawCentral: function(ctx, ctx_style, lod) {
                if (!this.central_text.to_render)
                    return;
                ctx.save();
                ctx.fillStyle = this.central_text.color;
                ctx.font = this.central_text.font;
                ctx.textBaseline = "middle";
                ctx.textAlign = "center";
                ctx.fillText(this.central_text.text, this.width()/2.0, this.height() / 2.0);
                ctx.restore();
            }
        },
        CommentNode: {
            alpha: 0.5,
            style: {
                normal: {
                    ctx_style: {
                        fill_style: "#CBCBCBFF",
                        stroke_style: "#2b2b2b",
                        line_width: 1,
                    },
                   draw: function(ctx, ctx_style, lod) {
                        this._draw.call(this, ctx, ctx_style, lod);
                    }
                },
                selected: {
                    ctx_style: {
                        fill_style: "#CBCBCBFF",
                        stroke_style: "#ffcc00",
                        line_width: 3,
                    },
                   draw: function(ctx, ctx_style, lod) {
                        this._draw.call(this, ctx, ctx_style, lod);
                    }
                },
            },
            _draw: function(ctx, ctx_style, lod) {
                ctx.save()
                ctx.globalAlpha = this.alpha;
                ctx.fillStyle = ctx_style.fill_style;
                if(ctx_style.stroke_style)
                    ctx.strokeStyle = ctx_style.stroke_style;
                ctx.beginPath();
                ctx.lineWidth = ctx_style.line_width;
                ctx.rect(0, 0, this.width(), this.height());
                ctx.fill();
                ctx.stroke();
                ctx.globalAlpha = 1;
                ctx.font = "20px Arial";
                ctx.textBaseline = "bottom";
                ctx.textAlign = "left";
                ctx.fillStyle = "#2b2b2b";
                ctx.fillText("Gaussian Filter", 0, 0);
                ctx.restore();
            },
        },

        RerouteNode: {
            margin: [5, 8, 6, 8], //top right bottom left
            width: function() {
                if(this.current_state != VisualState.selected)
                    return this.slot.width();
                return this.slot.width() + this.margin[1] +　this.margin[3];
            },
            height: function() {
               if(this.current_state != VisualState.selected)
                    return this.slot.height();
               return this.slot.height() + this.margin[0] +　this.margin[2];
            },
            size: function() {
                let left = - this.slot.width() / 2.0;
                let top = - this.slot.height() / 2.0;
                if(this.current_state == VisualState.selected){
                    left = - this.width() / 2.0;
                    top = - this.height() / 2.0;
                }
                return {left: left, top:  top, width: this.width(), height: this.height()}
            },
            style: {
                normal: {
                    ctx_style: {
                    },
                    draw: function(ctx, ctx_style, lod) {
                        this._draw.call(this, ctx, ctx_style, lod);
                    }
                },
                hovered: {
                    ctx_style: {
                    },
                    draw: function(ctx, ctx_style, lod) {
                        this._draw.call(this, ctx, ctx_style, lod);
                    }
                },
                selected: {
                    ctx_style: {
                        fill_style: "#b6b6b6",
                        stroke_style: "#ffcc00",
                        line_width: 3,
                        round_radius: 8
                    },
                   draw: function(ctx, ctx_style, lod) {
                        this._draw.call(this, ctx, ctx_style, lod);
                    }
                },
            },
            setSlotsTranslation: function(){
                this.slot.translate.x = - this.slot.width() / 2.0;
                this.slot.translate.y = - this.slot.height() / 2.0;
            },
            _draw: function(ctx, ctx_style, lod) {
                if(this.current_state == VisualState.selected)
                    this._drawBackground(ctx, ctx_style, lod);
                this._drawSlots(ctx, lod);
            },
        },

        Connector: {
            default_color: "#bdbbbb",
            detect_distance: 1,
            style: {
                normal: {
                    ctx_style: {
                        stroke_style: "#126acf",
                        line_width: 2,
                        line_join: "round",
                        alpha: 1
                    },
                    draw: function(ctx, ctx_style, lod) {
                        if(this.out_node.getSlotCtxStyle)
                            ctx_style.stroke_style = this.out_node.getSlotCtxStyle(this.out_slot_name).strokeStyle;
                        else if (this.in_node.getSlotCtxStyle)
                            this.ctx_style.stroke_style = this.in_node.getSlotCtxStyle(this.in_slot_name).strokeStyle;
                        this._draw.call(this, ctx, ctx_style);
                    }
                },
                hovered: {
                    ctx_style: {
                        stroke_style: "#f7bebe",
                        line_width: 2,
                        line_join: "round",
                        alpha: 1
                    },
                    draw: function(ctx, ctx_style, lod) {
                       this._draw.call(this, ctx, ctx_style);
                    }
                }
            },
            _draw: function(ctx, ctx_style) {
                ctx.save();
                ctx.beginPath();
                ctx.lineJoin = ctx_style.line_join;
                ctx.lineWidth = ctx_style.line_width;
                ctx.strokeStyle = ctx_style.stroke_style;
                ctx.globalAlpha = ctx_style.alpha;
                this.detect_distance = ctx.lineWidth;
                const from = this.fromPos();
                const to = this.toPos();
                const distance = from.distanceTo(to);
                ctx.moveTo(from.x, from.y);
                this.cp1 = new Point(from.x + distance * 0.3, from.y);
                this.cp2 = new Point(to.x - distance * 0.3, to.y);
                ctx.bezierCurveTo(
                    this.cp1.x, this.cp1.y,
                    this.cp2.x, this.cp2.y,
                    to.x, to.y);
                ctx.stroke();
                ctx.restore();
            },
            isCollided: function(scene_x, scene_y){
                return isPointOnCubicCurve(scene_x, scene_y, this.fromPos(), this.cp1, this.cp2, this.toPos(), this.detect_distance);
            }
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
        this.is_debug = false;
        this.render_method_for_layer = {
            "action": this._renderActions.bind(this),
            "nodes": this._renderNodes.bind(this),
            "connectors": this._renderConnectors.bind(this),
            "comments": this._renderComments.bind(this),
            "background": this._renderBackground.bind(this)
        };
        this.render_order_upwards = ['background', 'comments', 'connectors', 'nodes', 'action'];
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
     * @param changed_obj "background" "connectors" "nodes" "action", "comments"
     */
    Renderer.prototype.setToRender = function(which_layer) {
        if (this.layers[which_layer]) {
            this.layers[which_layer].re_render = true;
        }
        if(which_layer=="nodes")
            this.layers["comments"].re_render = true;
    };

    Renderer.prototype.updateAllLayersSize = function(width, heigth) {
        for (const layer of Object.values(this.layers)) {
            layer.updateLayerSize(width, heigth);
        }
        // when the canvas dimensions are set, the canvas is cleared
        // this means that we need to update the canvas immediately,
        // as it may be displayed before the next animation frame is
        // called.
        this.renderOneFrame();
    };

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
        let scale = this.scene.viewScale();
        ctx.scale(scale, scale);
        ctx.translate(this.scene.view.translate.x, this.scene.view.translate.y);
    };

    Renderer.prototype._ctxFromSceneToView = function(ctx) {
        ctx.restore();
    };

    Renderer.prototype._ctxFromSceneToNode = function(ctx, node) {
        ctx.save();
        ctx.translate(node.translate.x, node.translate.y);
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
        if(this.is_debug) {
            this.layers['debug'].render_method();
            re_render_any_layer = true;
        }
        return re_render_any_layer;
    }

    Renderer.prototype.forceRenderLayers = function(names) {
        if (!names)
            names = Object.keys(this.layers);
        for (let name of names) {
            const layer = this.layers[name];
            layer.re_render = true;
        }
        if(!this.is_rendering)
            this.renderOneFrame();
    }

    Renderer.prototype._compositeLayers = function() {
        let ctx = this.getDrawingContextFrom(this.getCanvas());
        const rect = this.scene.viewport;
        ctx.clearRect(rect.left, rect.top, rect.width, rect.height);
        for (const name of this.render_order_upwards) {
             ctx.drawImage(this.layers[name].canvas, 0, 0);
        }
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
        ctx.clearRect(rect.left, rect.top, rect.width, rect.height);
        this.scene.draw(ctx, rect, this.scene.lod);
        this._ctxFromSceneToView(ctx);
    };

    Renderer.prototype._renderComments = function() {
        let layer = this.layers['comments'];
        let ctx = this.getDrawingContextFrom(layer.canvas);
        this._ctxFromViewToScene(ctx);
        const scene_rect = this.scene.sceneRect();
        ctx.clearRect(scene_rect.left, scene_rect.top, scene_rect.width, scene_rect.height);
        for (let comment of this.scene.visibleNodes(CommentNode)) {
            this._ctxFromSceneToNode(ctx, comment);
            comment.draw(ctx, this.scene.lod);
            this._ctxFromNodeToScene(ctx);
        }
        this._ctxFromSceneToView(ctx);
    };

    Renderer.prototype._renderConnectors = function() {
        let layer = this.layers['connectors'];
        let ctx = this.getDrawingContextFrom(layer.canvas);
        this._ctxFromViewToScene(ctx);
        const scene_rect = this.scene.sceneRect();
        ctx.clearRect(scene_rect.left, scene_rect.top, scene_rect.width, scene_rect.height);
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
        ctx.clearRect(scene_rect.left, scene_rect.top, scene_rect.width, scene_rect.height);
        for (let node of Object.values(this.scene.visibleNodes(Node, CommentNode))) {
            this._ctxFromSceneToNode(ctx, node);
            node.draw(ctx, this.scene.lod);
            this._ctxFromNodeToScene(ctx);
        }
        this._ctxFromSceneToView(ctx);
    };

    Renderer.prototype._renderActions = function(draw) {
        let layer = this.layers['action'];
        let ctx = this.getDrawingContextFrom(layer.canvas);
        const scene_rect = this.scene.sceneRect();
        this._ctxFromViewToScene(ctx);
        ctx.clearRect(scene_rect.left, scene_rect.top, scene_rect.width, scene_rect.height);
        if(this.scene.command_in_process && this.scene.command_in_process.draw)
            this.scene.command_in_process.draw(ctx, this.scene.lod);
        this._ctxFromSceneToView(ctx);
    };

    Renderer.prototype.debug = function() {
        if(!this.is_debug) {
            if(!this.layers['debug'])
                this.layers['debug'] = new RenderedLayer(true, this.createNewCanvas(), this._renderDebugInfo.bind(this));
            this.render_order_upwards.push('debug');
            this.is_debug = true;
        }
        else {
            this.render_order_upwards.pop();
            this.is_debug = false;
            this.forceRenderLayers();
        }
    };

    Renderer.prototype._renderDebugInfo = function() {
        let layer = this.layers['debug'];
        let ctx = this.getDrawingContextFrom(layer.canvas);
        this._ctxFromViewToScene(ctx);
        const rect = this.scene.sceneRect();
        ctx.clearRect(rect.left, rect.top, rect.width, rect.height);
        this._renderBoundingRects(ctx);
        this._renderMousePos(ctx);
        this._ctxFromSceneToView(ctx);
        this._renderUndoHistory(ctx);
    };

    Renderer.prototype._renderMousePos = function (ctx){
        if(this.scene.last_scene_pos){
            ctx.fillStyle = 'rgba(255,197,0,1)';
            ctx.beginPath();
            ctx.arc(this.scene.last_scene_pos.x, this.scene.last_scene_pos.y, 3, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.fill();
        }
    }

    Renderer.prototype._renderBoundingRects = function(ctx){
        let z_value = 0;
        let line_height = 10;
        for (const item of this.scene.collision_detector.allZOrderedBoundingRects()) {
            ctx.fillStyle = 'rgba(249,59,81,0.3)';
            ctx.fillRect(item.left, item.top, item.width, item.height);
            ctx.fillStyle = 'rgba(255,193,0,0.71)';
            let child_items = item.owner.collidable_components? Object.values(item.owner.collidable_components) : [];
            for (const comp of child_items) {
                this._ctxFromSceneToNode(ctx, item.owner);
                let rect = comp.getBoundingRect();
                ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
                this._ctxFromNodeToScene(ctx);
            }
            ctx.fillStyle = '#000000';
            ctx.textAlign = "right";
            ctx.textBaseline = "top";
            if(!item.owner.title)
                ctx.fillText("title: " + item.owner.constructor.name, item.left - 2, item.top);
            ctx.fillText("z-order: " + z_value.toString(), item.left - 2, item.top + line_height);
            ctx.fillText("state: " + item.owner.current_state, item.left, item.top + 2*line_height);
            z_value++;
        }
    }

    Renderer.prototype._renderUndoHistory = function(ctx){
        ctx.save();
        ctx.textBaseline = "top";
        let undo_history = this.scene.undo_history
        let length = undo_history.undo_history.length;
        let reverse_index = undo_history.reverse_index;
        let line_height = 15;
        let text_x = 3;
        let text_y = 3;
        ctx.fontStyle = "20px Arial";
        ctx.fillText("Undo History", text_x, text_y);
        let max_rows = Math.max(Math.floor((this.scene.canvas.height - text_y) / line_height) - 1, 0) ;

        let start_render_index = length - 1;
        reverse_index = Math.min(reverse_index, start_render_index);
        if(reverse_index + 1 >= max_rows){
            start_render_index = start_render_index - (reverse_index + 1 - max_rows);
        }
        for (let i=0; i < Math.min(length, max_rows); i++){
            let index = start_render_index - i;
            if((length - index - 1) == this.scene.undo_history.reverse_index)
                ctx.fillStyle = 'rgb(247,0,0)';
            else
                ctx.fillStyle = 'rgb(1,1,1)'
            ctx.fillText(index.toString() + " " + undo_history.undo_history[index].desc,
                text_x, text_y + (i + 1)*line_height);
        }
        ctx.restore();
    }

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

    function Rect(left, top, width, height) {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
        Object.defineProperties(this, {
            "x_1": {
                get() {
                    return this.left;
                }
            },
            "y_1": {
                get() {
                    return this.top;
                }
            },
            "x_2": {
                get() {
                    return this.left + this.width;
                }
            },
            "y_2": {
                get() {
                    return this.top + this.height;
                },
            },
        });
    };

    Rect.prototype.isValid = function() {
        return this.x_1 <= this.x_2 && this.y_1 <= this.y_2;
    };

    Rect.prototype.isIntersectWith = function(rect) {
        if (!this.isValid() || !rect || !rect.isValid()) return false;
        return !(this.x_1 > rect.x_2 || rect.x_1 > this.x_2 ||
            this.y_1 > rect.y_2 || rect.y_1 > this.y_2)
    };

    Rect.prototype.isInsideRect = function(rect) {
        return rect.isInside(this.x_1, this.y_1) && rect.isInside(this.x_2, this.y_2)
    }

    Rect.prototype.isInside = function(x, y) {
        return inClosedInterval(x, this.x_1, this.x_2) && inClosedInterval(y, this.y_1, this.y_2);
    };

    function inClosedInterval(v, min, max) {
        return v >= min && v <= max;
    }

    /**
     * the reverse index of the command to be undo = this.reverse_index, [0, undo_history.length]
     * the reverse index of the command to be redo = this.reverse_index + 1
     * @constructor
     */
    function UndoHistory() {
        this.reverse_index = 0;
        this.undo_history = [];
        this.undo_desc = "Nothing to undo"
        this.redo_desc = "Nothing to redo";
    }

    UndoHistory.prototype.updateDesc = function() {
        let length = this.undo_history.length;
        let this_command = this.undo_history[length - this.reverse_index - 1];
        this.undo_desc = this_command ? this_command.desc : "Nothing to undo";
        let next_command = this.undo_history[length - this.reverse_index];
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
        let length = this.undo_history.length;
        let command = this.undo_history[length - this.reverse_index];
        command.redo();
        this.reverse_index--;
        this.updateDesc();
        return command;
    }

    UndoHistory.prototype.addCommand = function(command) {
        this.undo_history.splice(this.undo_history.length - this.reverse_index, this.reverse_index)
        this.undo_history.push(command);
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
        this.pluginRenderingConfigForItems();
        this.updateBoundingRectInGraph();
        this.last_client_pos = [0, 0];
        this.pointer_down = null; //pointer means any input devices like mouse, pen, touch surfaces
        this.force_lod = null;
        Object.defineProperty(this, "lod", {
            get() { return this.force_lod != null? this.force_lod:this.view.lod;}
        })
        Object.defineProperty(this, "viewport", {
            get() { return this.view.viewport;}
        })
    };

    Scene.prototype.resize = function(w, h) {
        if(!w ||!h) return;
        if (this.canvas.width == w && this.canvas.height == h) {
            return;
        }
        this.canvas.width = w;
        this.canvas.height = h;
        this.renderer.updateAllLayersSize(w, h);
        debug_log('scene resize');
    }

    Scene.prototype.fitToParentWidth = function() {
        let parent = this.canvas.parentNode;
        let w = parent.offsetWidth;
        if (w) {
            this.resize(w, this.canvas.height);
        }
    }

    Scene.prototype.fitToParentHeight = function() {
        let parent = this.canvas.parentNode;
        let h = parent.offsetHeight;
        if (h) {
            this.resize(this.canvas.width, h);
        }
    }

    Scene.prototype.fitToParentSize = function() {
        this.fitToParentWidth();
        this.fitToParentHeight();
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

    Scene.prototype.pluginRenderingConfigForItems = function() {
        for (const node of Object.values(this.graph.nodes))
            node.pluginRenderingTemplate(this.rendering_template);
        for (const connector of Object.values(this.graph.connectors))
            connector.pluginRenderingTemplate(this.rendering_template['Connector']);
    }

    Scene.prototype.start = function(event_capture){
        this.renderer.startRender();
        this.event_capture = event_capture == true;
        this.bindEventToScene();
    }

    Scene.prototype.stop = function() {
        this.renderer.stopRender();
        this.unbindEventToScene();
    };

    Scene.prototype.sceneRect = function() {
        return this.view.sceneRect();
    };

    Scene.prototype.nodes = function() {
        return Object.values(this.graph.nodes);
    };

    Scene.prototype.visibleNodes = function(include_type, exclude_type) {
        let sceneRect = this.sceneRect();
        return this.collision_detector.getItemsOverlapWith(sceneRect, include_type, exclude_type, true);
    };

    Scene.prototype.deselectNode = function(node, not_to_redraw) {
        if (!this.isNodeValid(node))
            return false;
        node.deselected();
        delete this.selected_nodes[node.id];
        this.collision_detector.updateBoundingRect(node);
        if (!not_to_redraw)
            this.setToRender("nodes");
        return true;
    };

    Scene.prototype.deselectNodes = function(nodes, not_to_redraw) {
        let did = false;
        for (let node of nodes) {
            did = this.deselectNode(node, true) || did;
        }
        if(!did)
            return false;
        if (!not_to_redraw)
            this.setToRender("nodes");
        return true;
    };

    Scene.prototype.deselectSelectedNodes = function(not_to_redraw) {
        if(Object.keys(this.selected_nodes).length === 0)
            return false;
        for (const node of Object.values(this.selected_nodes)) {
            node.deselected();
            this.collision_detector.updateBoundingRect(node);
        }
        this.selected_nodes = {};
        if (!not_to_redraw)
            this.setToRender("nodes");
        return true;
    };

    Scene.prototype.isNodeValid = function(node) {
        if (!node) {
            console.warn("The node is null");
            return false;
        }
        if (!(node instanceof Node)) {
            console.warn(`The ${node} is not the instance of the Node`);
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
            console.warn(`The ${connector} is not the instance of the Connector`);
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
            return false;
        if (!append_to_selections)
            this.deselectSelectedNodes(true);
        if (this.selected_nodes[node.id] == node)
            return false;
        node.selected();
        this.selected_nodes[node.id] = node;
        this.collision_detector.setTopZOrder(node);
        this.collision_detector.updateBoundingRect(node);
        if (!not_to_redraw)
            this.setToRender("nodes");
        return true;
    };

    Scene.prototype.selectNodes = function(nodes, append_to_selections, not_to_redraw) {
        if (!append_to_selections)
            this.deselectSelectedNodes(nodes.length!=0);
        let did = false;
        for (let node of nodes) {
            did = this.selectNode(node, true, true) || did;
        }
        if(!did)
            return false;
        if (!not_to_redraw)
            this.setToRender("nodes");
        return true;
    };

    Scene.prototype.selectAllNodes = function(not_to_redraw) {
        return this.selectNodes(Object.values(this.graph.nodes), not_to_redraw);
    };

    Scene.prototype.toggleNodeSelection = function(node, not_to_redraw) {
        if (!this.isNodeValid(node))
            return false;
        node.toggleSelection();
        if (this.selected_nodes[node.id])
            delete this.selected_nodes[node.id];
        else
            this.selected_nodes[node.id] = node;
        this.collision_detector.updateBoundingRect(node);
        if (!not_to_redraw)
            this.setToRender("nodes");
        return true;
    };

    Scene.prototype.toggleNodesSelection = function(nodes, not_to_redraw) {
        let did = false;
        for (let node of nodes) {
            did = this.toggleNodeSelection(node, true) || did;
        }
        if(!did)
            return false;
        if (!not_to_redraw)
            this.setToRender("nodes");
        return true;
    };

    Scene.prototype.removeSelectedNodes = function() {
        this.removeNodes(Object.values(this.selected_nodes));
        this.selected_nodes = {};
        return true;
    };

    Scene.prototype.removeNode = function(node, not_to_redraw) {
        this.deselectNode(node);
        let connectors = this.graph.getConnectorsLinkedToNodes([node]);
        for (const connector of connectors) {
            this.collision_detector.removeBoundingRect(connector);
        }
        let did = this.graph.removeNode(node);
        if(!did)
            return false;
        this.collision_detector.removeBoundingRect(node);
        if (!not_to_redraw)
            this.setToRender("nodes");
        return true;
    };

    Scene.prototype.removeNodes = function(nodes, not_to_redraw) {
        let did = false;
        for (const node of nodes) {
            did = this.removeNode(node, true) || did;
        }
        if(!did)
            return false;
        if (!not_to_redraw)
            this.setToRender("nodes");
            this.setToRender("connectors");
        return true;
    };

    Scene.prototype.addNode = function(node, not_to_redraw) {
        if (!this.isNodeValid(node))
            return false;
        let did = this.graph.addNode(node);
        if (!did)
            return false;
        node.pluginRenderingTemplate(this.rendering_template);
        this.collision_detector.addBoundingRect(node);
        this.selectNode(node);
        if (!not_to_redraw)
            this.setToRender("nodes");
        return true;
    };

    Scene.prototype.addNodes = function(nodes, not_to_redraw) {
        let did = false;
        for (const node of nodes) {
            did = this.addNode(node, true) || did;
        }
        if(!did)
            return false;
        this.selectNodes(nodes)
        if (!not_to_redraw)
            this.setToRender("nodes");
        return true;
    };

    Scene.prototype.translateNode= function(node, delta_x, delta_y){
         node.addTranslate(delta_x, delta_y);
         this.collision_detector.updateBoundingRect(node);
         let connectors = this.getConnectorsLinkedToNodes([node]);
         for (const connector of connectors) {
            this.collision_detector.updateBoundingRect(connector);
         }
    };

    Scene.prototype.setNodeTranslation = function(node, translation){
         node.translate = translation;
         this.collision_detector.updateBoundingRect(node);
         let connectors = this.getConnectorsLinkedToNodes([node]);
         for (const connector of connectors) {
            this.collision_detector.updateBoundingRect(connector);
         }
    };

    Scene.prototype.addConnector = function(connector, not_to_redraw) {
        if (!this.isConnectorValid(connector))
            return false;
        let out_node = connector.out_node;
        let in_node = connector.in_node;
        let in_slot = in_node.getSlot(connector.in_slot_name);
        let connection = out_node.allowConnectTo(connector.out_slot_name, in_node, in_slot);
        if (connection.method == SlotConnectionMethod.null)
            return false;
        if (connection.method == SlotConnectionMethod.replace) {
            let as_output = connection.args.node == out_node;
            let connectors = this.graph.getConnectorsLinkedToSlot(connection.args.node, connection.args.slot, as_output);
            this.collision_detector.removeBoundingRect(connectors[0]);
        }
        let did = this.graph.addConnector(connector);
        let out_slot = out_node.getSlot(connector.out_slot_name);
        if(in_slot.data_type == "*" && out_slot.data_type != "*")
            in_slot.setDataType(out_slot.data_type);
        if(out_slot.data_type == "*" && in_slot.data_type != "*")
            out_slot.setDataType(in_slot.data_type);
        if(!did)
            return false;
        connector.pluginRenderingTemplate(this.rendering_template['Connector']);
        this.collision_detector.addBoundingRect(connector);
        if (!not_to_redraw) {
            this.setToRender("nodes");
            this.setToRender("connectors");
        }
        return true;
    };

    Scene.prototype.addConnectors = function(connectors, not_to_redraw) {
        let did = false;
        for (const connector of connectors) {
            did = this.addConnector(connector, true) || did;
        }
        if(!did)
            return false;
        if (!not_to_redraw) {
            this.setToRender("nodes");
            this.setToRender("connectors");
        }
        return true;
    };

    Scene.prototype.removeConnector = function(connector, not_to_redraw) {
        this.collision_detector.removeBoundingRect(connector);
        let did = this.graph.removeConnector(connector);
        if(!did)
            return false;
        if (!not_to_redraw) {
            this.setToRender("nodes");
            this.setToRender("connectors");
        }
        return true;
    };

    Scene.prototype.removeConnectors = function(connectors, not_to_redraw) {
        let did = false;
        for (const connector of connectors) {
            did = this.removeConnector(connector, true) || false;
        }
        if(!did)
            return false;
        if (!not_to_redraw) {
            this.setToRender("nodes");
            this.setToRender("connectors");
        }
        return true;
    };

    Scene.prototype.copySelectedNodeToClipboard = function() {
        let clipboard_info = {
            is_empty: true,
            nodes: {},
            connectors: [],
            min_x_of_nodes: Infinity,
            min_y_of_nodes: Infinity
        };
        for (const node of Object.values(this.selected_nodes)) {
            let new_node = type_registry.cloneNode(node);
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
        clipboard_info.is_empty = Object.keys(this.selected_nodes).length === 0;
        localStorage.setItem("visual_programming_env_clipboard", JSON.stringify(clipboard_info));
        return clipboard_info;
    };

    Scene.prototype.pasteFromClipboard = function(pointer_x, pointer_y, config) {
        let created = {
            "is_empty": true,
            "nodes": [],
            "connectors": []
        };
        config = config || localStorage.getItem("visual_programming_env_clipboard");
        let clipboard_info = JSON.parse(config);
        if (!clipboard_info || clipboard_info.is_empty) {
            return created;
        }
        created.is_empty = false;
        let new_nodes = {};
        for (const [old_id, node_config] of Object.entries(clipboard_info.nodes)) {
            let node = type_registry.createNode(node_config.type);
            if (!node) continue;
            node.configure(node_config);
            //paste in last known mouse position
            node.addTranslate(pointer_x - clipboard_info.min_x_of_nodes, pointer_y - clipboard_info.min_y_of_nodes);
            this.addNode(node);
            created.nodes.push(node);
            new_nodes[old_id] = node;
        }
        for (const connector_config of clipboard_info.connectors) {
            if (!new_nodes[connector_config[1]] || !new_nodes[connector_config[3]]) continue;
            let connector = new Connector(connector_config[0], new_nodes[connector_config[1]], connector_config[2],
                new_nodes[connector_config[3]], connector_config[4]);
            this.addConnector(connector);
            created.connectors.push(connector);
        }
        this.selectNodes(Object.values(new_nodes));
        return created;
    };

    Scene.prototype.connectors = function() {
        return Object.values(this.graph.connectors);
    };

    Scene.prototype.getConnector = function(from_node, from_slot_name, to_node, to_slot_name) {
        return this.graph.getConnector(from_node, from_slot_name, to_node, to_slot_name);
    };

    Scene.prototype.getConnectorsLinkedToNodes = function(nodes) {
        return this.graph.getConnectorsLinkedToNodes(nodes);
    };

    Scene.prototype.getConnectorsLinkedToSlot = function(node, slot, as_output) {
        return this.graph.getConnectorsLinkedToSlot(node, slot, as_output);
    };

    Scene.prototype.visibleConnectors = function() {
        let sceneRect = this.sceneRect();
        return this.collision_detector.getItemsOverlapWith(sceneRect, Connector)
    };

    Scene.prototype.zoom = function(v, pivot_in_view) {
        let did = this.view.setScale(v, pivot_in_view);
        if(did)
            this.renderer.forceRenderLayers();
    };

    Scene.prototype.viewScale = function() {
        return this.view.scale;
    };

    Scene.prototype.pan = function(delta_x, delta_y) {
        this.setCursor('Move');
        this.view.addTranslate(delta_x, delta_y);
        debug_log('scene move');
        this.renderer.forceRenderLayers();
    };

    Scene.prototype.draw = function(ctx, rect, lod) {
        let style = this.style[lod || 0];
        if (style.image) {
           this.draw_image_on_background(ctx, rect, style);
        } else {
            ctx.fillStyle = style.fill_color;
            ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
        }
    };

    Scene.prototype.draw_image_on_background = function(ctx, rect, style){
        let img_need_loaded = !this.current_bg || this.current_bg.src != style.image;
        if(img_need_loaded) {
            this.current_bg = new Image();
            this.current_bg.src = style.image;
            this.current_bg.onload = () => {
                this.renderer.forceRenderLayers(["background"]);
            }
        } else{
            ctx.globalAlpha = style.global_alpha;
            ctx.fillStyle = ctx.createPattern(this.current_bg, style.image_repetition);
            ctx.imageSmoothingEnabled = true;
            ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
            ctx.globalAlpha = 1;
        }
    }

    Scene.prototype.addSceneCoordinateToEvent = function(e) {
        // we will move outside the canvas
        let canvas_client_rect = this.canvas.getBoundingClientRect();
        let pos_in_view = new Point(e.clientX - canvas_client_rect.left, e.clientY - canvas_client_rect.top);
        this.last_scene_pos = this.view.mapToScene(pos_in_view);
        e.sceneX = this.last_scene_pos.x;
        e.sceneY = this.last_scene_pos.y;
        e.sceneMovementX = (e.clientX - this.last_client_pos[0]) / this.view.scale;
        e.sceneMovementY = (e.clientY - this.last_client_pos[1]) / this.view.scale;
        this.last_client_pos = [e.clientX, e.clientY];
    }

    Scene.prototype.execCommand = function(command, args) {
        this.command_in_process = command;
        args = args || [];
        this.command_in_process.exec.apply(this.command_in_process, args);
        debug_log(`exec ${this.command_in_process.constructor.name}`);
        if(this.command_in_process.draw)
            this.setToRender("action");
        if (!command.update)
            this.endCommand(args);
    }

    Scene.prototype.updateCommand = function(args) {
        debug_log(`update ${this.command_in_process.constructor.name}`);
        this.command_in_process.update.apply(this.command_in_process, args);
        if(this.command_in_process.draw)
            this.setToRender("action");
    }

    Scene.prototype.endCommand = function(args) {
        this.command_in_process.end.apply(this.command_in_process, args);
        if(this.command_in_process.support_undo)
            this.undo_history.addCommand(this.command_in_process);
        debug_log(`end ${this.command_in_process.constructor.name}`);
        if(this.command_in_process.draw)
            this.setToRender("action");
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
        console.log("binding");
        this._keyDown_callback = this.onKeyDown.bind(this);
        this.canvas.addEventListener("keydown", this._keyDown_callback, this.event_capture);
        this._mousewheel_callback = this.onMouseWheel.bind(this);
        this.canvas.addEventListener("mousewheel", this._mousewheel_callback, this.event_capture);
        this._mouseDown_callback = this.onMouseDown.bind(this);
        this.canvas.addEventListener("mousedown", this._mouseDown_callback, this.event_capture);
        this._mouseMove_callback = this.onMouseMove.bind(this);
        this.canvas.addEventListener("mousemove", this._mouseMove_callback, this.event_capture);
        this._mouseUp_callback = this.onMouseUp.bind(this);
        this.canvas.addEventListener("mouseup", this._mouseUp_callback, this.event_capture);
        this._dblclick_callback = this.onDblclick.bind(this);
        this.canvas.addEventListener("dblclick", this._dblclick_callback, this.event_capture);
        this._events_binded = true;
    }

    Scene.prototype.unbindEventToScene = function() {
        if (!this._events_binded)
            return;
        console.log("unbinding");
        this.canvas.removeEventListener("keydown", this._keyDown_callback);
        this._keyDown_callback = null;
        this.canvas.removeEventListener("mousewheel", this._mousewheel_callback);
        this._mousewheel_callback = null;
        this.canvas.removeEventListener("mousedown", this._mouseDown_callback);
        this._mouseDown_callback = null;
        this.canvas.removeEventListener("mousemove", this._mouseMove_callback);
        this._mouseMove_callback = null;
        this.canvas.removeEventListener("mouseup", this._mouseUp_callback);
        this._mouseUp_callback = null;
        this.canvas.removeEventListener("dblclick", this._dblclick_callback);
        this._dblclick_callback = null;
        this._events_binded = false;
        this.last_scene_pos = undefined;
    }

    Scene.prototype.onKeyDown = function(e) {
        console.log("KeyDown!");
        if (e.type == "keydown") {
            if (e.code == 'Escape') {
                this.deselectSelectedNodes();
                e.preventDefault();
            }
            else if (e.code == 'Delete') {
                let command = new RemoveSelectedNodesCommand(this);
                this.execCommand(command);
            }
            else if (e.code == "KeyZ" && e.ctrlKey) {
                this.undo_history.undo();
                e.preventDefault();
            }
            else if (e.code == "KeyY" && e.ctrlKey) {
                this.undo_history.redo();
                e.preventDefault();
            }
            else if (e.code == "KeyA" && e.ctrlKey) {
                this.selectAllNodes();
                e.preventDefault();
            }
            else if (e.code == "KeyQ" && e.ctrlKey) {
                let node = type_registry.createNode("Image.Read");
                node.translate = new Point(10, 30);
                this.execCommand(new AddNodeCommand(this), [node]);
                let node2 = type_registry.createNode("Image.GaussianFilter");
                node2.translate= new Point(200, 100);
                this.execCommand(new AddNodeCommand(this), [node2]);
                let connector = new Connector(null, node, 'out_exec', node2, 'in_exec');
                this.addConnector(connector);
                let node3 = type_registry.createNode("Image.Write");
                node3.translate= new Point(400, 40);
                this.execCommand(new AddNodeCommand(this), [node3]);
                let connector2 = new Connector(null, node, 'image', node3, 'image');
                this.addConnector(connector2);
                let connector3 = new Connector(null, node2, 'out_exec', node3, 'in_exec');
                this.addConnector(connector3);

                let node4 = type_registry.createNode("Image.Write");
                node4.translate= new Point(550, 100);
                this.execCommand(new AddNodeCommand(this), [ node4]);
                let connector4 = new Connector(null, node3, 'out_exec', node4, 'in_exec');
                this.addConnector(connector4);
                let connector5 = new Connector(null, node2, 'image', node4, 'image');
                this.addConnector(connector5);

                let connector6 = new Connector(null, node, 'image', node2, 'input');
                this.addConnector(connector6);

                let connector8 = new Connector(null, node, 'out_exec', node4, 'in_exec');
                this.addConnector(connector8);

                let node5 = type_registry.createNode("Image.Image");
                node5.translate= new Point(300, 100);
                this.execCommand(new AddNodeCommand(this), [ node5]);

                let node6 = type_registry.createNode("Image.ImagePlusImage");
                node6.translate= new Point(300, 200);
                this.execCommand(new AddNodeCommand(this), [ node6]);

                let node7 = type_registry.createNode("Comment");
                node7.translate= new Point(20, 200);
                this.execCommand(new AddNodeCommand(this), [ node7]);

                let node8 = type_registry.createNode("RerouteNode");
                node8.translate= new Point(100, 200);
                this.execCommand(new AddNodeCommand(this), [ node8]);
                //this.selectAllNodes();
                e.preventDefault();
            }
            else if (e.code == "KeyC" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
                this.copySelectedNodeToClipboard();
            }
            else if (e.code == "KeyV" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
                let command = new PasteFromClipboardCommand(this);
                this.execCommand(command);
            }
            else if (e.code == "KeyX" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
                let command = new CutSelectedNodesCommand(this);
                this.execCommand(command);
            }
            else if (e.code == "KeyD" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
                let command = new DuplicateNodeCommand(this);
                this.execCommand(command);
                e.preventDefault();
            }
            else if (e.code == "ArrowUp" && !(e.metaKey || e.ctrlKey) && !e.shiftKey) {
                NudgetNode(0, -1, this, e);
            }
            else if (e.code == "ArrowDown" && !(e.metaKey || e.ctrlKey) && !e.shiftKey) {
                NudgetNode(0, 1, this, e);
            }
            else if (e.code == "ArrowLeft" && !(e.metaKey || e.ctrlKey) && !e.shiftKey) {
                NudgetNode(-1, 0, this, e);
            }
            else if (e.code == "ArrowRight" && !(e.metaKey || e.ctrlKey) && !e.shiftKey) {
                NudgetNode(1, 0, this, e);
            }
            else if(e.code == "KeyZ"){
                let command = new RemoveAllConnectorsOfNodeCommand(this);
                this.execCommand(command);
            }
            else if(e.code == "KeyQ"){
                let command = new RemoveAllConnectorsOfSlotCommand(this);
                this.execCommand(command);
            }
            else if (e.code == "KeyD" && e.ctrlKey && e.shiftKey) {
                this.renderer.debug();
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
        let connectors = this.getConnectorsLinkedToSlot(hit.hit_item, hit.hit_component);
        if (e.shiftKey)
            return;
        else if(e.altKey){
            if(connectors.length>0)
                this.execCommand(new RemoveConnectorCommand(this), [connectors]);
            return;
        }
        else if (e.ctrlKey && connectors.length>0 && hit.hit_item instanceof RerouteNode) {
            this.execCommand(new ReconnectCommand(this), [e, connectors, hit.hit_component.isInput()]);
            return;
        }
        this.execCommand(new ConnectCommand(this), [e, hit.hit_item, hit.hit_component.name]);
    }

    Scene.prototype.leftMouseDownOnNode = function(e, hit) {
        let border = whichBorder(hit.hit_local_x, hit.hit_local_y, hit.hit_item);
        if (hit.hit_item.allow_resize && border)
            this.execCommand(new ResizeCommand(this, hit.hit_item), [e, border]);
        else if (hit.hit_component instanceof NodeSlot) {
            this.leftMouseDownOnSlot(e, hit);
        }
    }

    Scene.prototype.leftMouseDownOnScene = function(e) {
        this.execCommand(new MarqueeSelectionCommand(this), [e])
        this.bindEventToScene();
    }

    Scene.prototype.leftMouseUp = function(e, hit) {
        if (hit.is_hitted && hit.hit_item instanceof Node) {
            if (hit.hit_component)
                return;
            if (e.ctrlKey && !e.shiftKey) {
                this.toggleNodeSelection(hit.hit_item);
                return;
            }
            this.selectNode(hit.hit_item, e.shiftKey);
        }
    }

    Scene.prototype.rightMouseUp = function(e, hit) {
        //todo context menu
    }

    Scene.prototype.onMouseWheel = function(e) {
        debug_log('mouse wheel');
        this.addSceneCoordinateToEvent(e);
        let delta = e.deltaY * -0.002;
        this.zoom(this.viewScale() + delta, new Point(e.offsetX, e.offsetY));
        e.preventDefault();
    }

    Scene.prototype.moveAndUpEventsToDocument = function() {
        //mouse move event to the window in case it drags outside of the canvas
        this.canvas.removeEventListener("mousemove", this._mouseMove_callback);
        this.getDocument().addEventListener("mousemove", this._mouseMove_callback, false);
        this.getDocument().addEventListener("mouseup", this._mouseUp_callback, false);
    }

    Scene.prototype.moveAndUpEventsToScene = function() {
        //restore the mousemove event back to the canvas
        this.canvas.addEventListener("mousemove", this._mouseMove_callback, this.event_capture);
        this.getDocument().removeEventListener("mousemove", this._mouseMove_callback);
        this.getDocument().removeEventListener("mouseup", this._mouseUp_callback);
    }

    Scene.prototype.onMouseDown = function(e) {
        if (!this.addSceneCoordinateIfHandleMouseEvent(e))
            return;
        debug_log('mouse down and press the button ' +　e.button);
        this.moveAndUpEventsToDocument();
        this.pointer_down = e.button;
        this.hit_result = this.collision_detector.getHitResultAtPos(e.sceneX, e.sceneY);
        if (e.button == 0) {
            if (!this.hit_result.is_hitted || !this.hit_result.hit_item)
                this.leftMouseDownOnScene(e);
            else if(this.hit_result.hit_item instanceof Node)
                this.leftMouseDownOnNode(e, this.hit_result);
        }
        //e.preventDefault();
    }

    Scene.prototype.mouseHover = function(e, new_hit) {
        if(new_hit.is_hitted && new_hit.hit_item && new_hit.hit_item.allow_resize){
            let border = whichBorder(new_hit.hit_local_x, new_hit.hit_local_y, new_hit.hit_item);
            if (border) {
                let cursor = mapNodeBorderToCursor[border] || "default";
                this.setCursor(cursor);
                debug_log(border);
            }
            else {
                this.setCursor( "default");
            }
        }
        else{
            this.setCursor( "default");
        }
        let new_item = new_hit.hit_item;
        let new_comp = new_hit.hit_component;
        let old_item = this.hit_result != undefined? this.hit_result.hit_item : undefined;
        let old_comp = this.hit_result != undefined? this.hit_result.hit_component : undefined;
        if(this.hit_result && new_item == old_item && new_comp == old_comp)
            return;
        if(this.hit_result){
            if(new_item != old_item && old_item)
                old_item.mouseLeave(this.hit_result);
            if (new_comp != old_comp && old_comp)
                old_comp.mouseLeave();
        }
        if (new_hit.is_hitted){
            if(new_item && (this.hit_result? new_item != old_item : true))
                new_item.mouseEnter(new_hit);
            if(new_comp && (this.hit_result? new_comp != old_comp : true))
                new_comp.mouseEnter();
        }
        this.setToRender("nodes");
        this.setToRender("connectors");
    }

    Scene.prototype.onMouseMove = function(e) {
        debug_log('mouse move and press the button ' +　this.pointer_down);
        this.addSceneCoordinateToEvent(e);
        let new_hit = this.collision_detector.getHitResultAtPos(e.sceneX, e.sceneY);
        if (this.command_in_process)
            this.updateCommand([e, new_hit]);
        else if (this.pointer_down == null)
            this.mouseHover(e, new_hit);
        else if (this.pointer_down == 0 && this.hit_result.hit_item instanceof Node) {
            this.execCommand(new MoveCommand(this), [e, this.hit_result.hit_item]);
        }
        else if (this.pointer_down == 2)
            this.pan(e.sceneMovementX, e.sceneMovementY);
        this.hit_result = new_hit;
        e.preventDefault();
    }

    Scene.prototype.onMouseUp = function(e) {
        debug_log('mouse up and release the button ' +　e.button);
        this.pointer_down = null;
        this.moveAndUpEventsToScene();
        this.addSceneCoordinateToEvent(e);
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
        this.setCursor('default');
        e.preventDefault();
    }

    Scene.prototype.onDblclick = function(e){
        debug_log('mouse double click ' +　e.button);
        if (e.button == 0 &&　this.hit_result.hit_item instanceof Connector) {
            this.execCommand(new AddRerouteToConnectorCommand(this), [this.hit_result.hit_item]);
        }
    }

    Scene.prototype.getDocument = function() {
        return this.canvas.ownerDocument;
    };

    Scene.prototype.commands_for_node = [
        RemoveSelectedNodesCommand, CutSelectedNodesCommand,
        copySelectedNodeToClipboardCommand, DuplicateNodeCommand,
        RemoveAllConnectorsOfNodeCommand];
    Scene.prototype.commands_for_slot = [
        RemoveAllConnectorsOfSlotCommand];

    Scene.prototype.general_commands = [
        CreateNodeCommand
    ];

    Scene.prototype.getAllContextCommands = function() {

        let that = this;
        function toContextCommand(command_class){
            let command = new command_class(that);
            return {name: command.constructor.name,
            label: command.label || command.constructor.name,
            exec: function(args){
                that.execCommand(command, args);
            }}
        }

        let context_commands = [];
        for (const c of this.commands_for_node.concat(this.commands_for_slot).concat(this.general_commands)) {
            let context_command = toContextCommand(c);
            context_command.exec.bind(this);
            context_commands.push(context_command);
        };
        return context_commands;
    };

    Scene.prototype.getContextCommands = function() {
        let context_command_names = [];
        if(this.hit_result.is_hitted){
            if(this.hit_result.hit_item instanceof Node && !(this.hit_result.hit_component instanceof NodeSlot))
            {
                for (const c of this.commands_for_node) {
                    context_command_names.push({command: c.name, args: []});
                };
            }
            if(this.hit_result.hit_component instanceof NodeSlot)
            {
                 for (const c of this.commands_for_slot) {
                    context_command_names.push({command: c.name, args: []});
                };
            }
        }
        return context_command_names;
    };

    Scene.prototype.serialize = function () {
        let config = this.graph.serialize();
        config['view'] = {
            "translate": [this.view.translate.x, this.view.translate.y],
            "scale": this.view.scale}
        return config;
    }

    Scene.prototype.configure = function (config) {
        if(config['view'])
            if(config.view.translate instanceof Array && config.view.translate.length == 2)
                this.view.translate = new Point(config.view.translate[0], config.view.translate[1]);
            if(config.view.scale != null ||　config.view.scale != undefined)
                this.view.scale = config.view.scale;
        this.graph.configure(config);
        this.pluginRenderingConfigForItems();
        this.updateBoundingRectInGraph();
    }

    function NudgetNode(delta_x, delta_y, scene, e) {
        let command = new MoveCommand(scene);
        command.desc = 'Nudge Node';
        e.sceneMovementX = delta_x;
        e.sceneMovementY = delta_y;
        scene.execCommand(command, [e]);
        scene.endCommand([e]);
        e.preventDefault();
    }

    function Command() {}

    Command.prototype.label = "Command"; // shown in context menu
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

    function copySelectedNodeToClipboardCommand(scene) {
        this.label = "Copy";
        this.scene = scene;
        this.support_undo = false;
    }

    copySelectedNodeToClipboardCommand.prototype.exec = function(){
        this.scene.copySelectedNodeToClipboard();
    };

    Object.setPrototypeOf(copySelectedNodeToClipboardCommand.prototype, Command.prototype);

    function MoveCommand(scene) {
        this.desc = "Move Node";
        this.scene = scene;
        this.moving_nodes = [];
    }

    MoveCommand.prototype.exec = function(e, node) {
        this.start_state = [];
        if(node && !Object.keys(this.scene.selected_nodes).includes(node.id.toString()))
            this.scene.selectNode(node, e.shiftKey || e.ctrlKey, true);
        let comment_nodes = [];
        for (const node of Object.values(this.scene.selected_nodes)) {
            if(node instanceof CommentNode)
                comment_nodes.push(node);
            this.moving_nodes.push(node);
            this.start_state.push(new Point(node.translate.x, node.translate.y));
        }
        for(const comment of comment_nodes){
            let overlap_nodes = this.scene.collision_detector.getItemsInside(comment.getBoundingRect(), Node);
            for (const node of overlap_nodes) {
                if(!this.moving_nodes.includes(node)){
                    this.moving_nodes.push(node);
                    this.start_state.push(new Point(node.translate.x, node.translate.y));
                }
            }
        }
    }

    MoveCommand.prototype.update = function(e) {
        for (const node of Object.values(this.moving_nodes)) {
            this.scene.translateNode(node, e.sceneMovementX, e.sceneMovementY);
        }
        this.scene.setToRender("nodes");
        this.scene.setToRender("connectors");
    }

    MoveCommand.prototype.end = function(e) {
        this.update(e);
        this.end_state = [];
        for (const node of Object.values(this.moving_nodes)) {
            this.end_state.push(new Point(node.translate.x, node.translate.y));
        }
    }
    MoveCommand.prototype.undo = function() {
        let index = 0;
        for (const node of Object.values(this.moving_nodes)) {
            this.scene.setNodeTranslation(node, this.start_state[index]);
            index++;
        }
        this.scene.deselectSelectedNodes(true);
        this.scene.setToRender("nodes");
        this.scene.setToRender("connectors");
    }
    MoveCommand.prototype.redo = function() {
        let index = 0;
        for (const node of Object.values(this.moving_nodes)) {
            this.scene.setNodeTranslation(node, this.end_state[index]);
            index++;
        }
        this.scene.deselectSelectedNodes(true);
        this.scene.setToRender("nodes");
        this.scene.setToRender("connectors");
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
        let d = node.resize_detection_distance || 4;
        let vertical = Math.abs(x) < d? "left" :
            (Math.abs(x - node.width()) < d ? "right" : null);
        let horizontal = Math.abs(y) < d? "top" :
            (Math.abs(y - node.height()) < d ? "bottom" : null);
        let border_name = (horizontal ? horizontal: "") + (horizontal&&vertical? "_" : "" ) + (vertical ? vertical : "");
        return NodeBorder[border_name];
    }

    let mapNodeBorderToCursor = {
        "top": "ns-resize",
        "bottom": "ns-resize",
        "left": "ew-resize",
        "right": "ew-resize",
        "top_left": "nw-resize",
        "top_right": "ne-resize",
        "bottom_left": "sw-resize",
        "bottom_right": "se-resize"
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
        this.start_state = [
            this.resized_node.translate.x, this.resized_node.translate.y,
            this.resized_node.width(), this.resized_node.height()];
        this.support_undo = false;
    }

    ResizeCommand.prototype.update = function(e) {
        // e.sceneMovementX = e.sceneMovementY = 1;
        let moves = this.node_border.split('_');
        for (const move of moves) {
            switch (move){
                case NodeBorder.top:
                    let bottom = this.resized_node.translate.y + this.resized_node.height();
                    this.resized_node.setHeight(this.resized_node.height() - e.sceneMovementY);
                    this.resized_node.translate.y = bottom - this.resized_node.height();
                    break;
                case NodeBorder.bottom:
                    this.resized_node.setHeight(this.resized_node.height() + e.sceneMovementY);
                    break;
                case NodeBorder.left:
                    let right = this.resized_node.translate.x + this.resized_node.width();
                    this.resized_node.setWidth(this.resized_node.width() - e.sceneMovementX);
                    this.resized_node.translate.x = right - this.resized_node.width();
                    break;
                case NodeBorder.right:
                    this.resized_node.setWidth(this.resized_node.width() + e.sceneMovementX);
                    break;
            }
        }
        this.scene.collision_detector.updateBoundingRect(this.resized_node);
        this.scene.setToRender("nodes");
        this.support_undo = true;
    }

    ResizeCommand.prototype.end = function(e) {
        this.update(e);
        this.end_state = [
            this.resized_node.translate.x, this.resized_node.translate.y,
            this.resized_node.width(), this.resized_node.height()];
        this.scene.setCursor('default');
    }

    ResizeCommand.prototype.undo = function() {
        this.resized_node.translate.x = this.start_state[0];
        this.resized_node.translate.y = this.start_state[1];
        this.resized_node.setWidth(this.start_state[2]);
        this.resized_node.setHeight(this.start_state[3]);
        this.scene.setToRender("nodes");
    }

    ResizeCommand.prototype.redo = function() {
        this.resized_node.translate.x = this.end_state[0];
        this.resized_node.translate.y = this.end_state[1];
        this.resized_node.setWidth(this.end_state[2]);
        this.resized_node.setHeight(this.end_state[3]);
        this.scene.setToRender("nodes");
    }

    Object.setPrototypeOf(ResizeCommand.prototype, Command.prototype);

    function MarqueeSelectionCommand(scene) {
        this.desc = "Select Nodes";
        this.scene = scene;
        this.support_undo = false;
        this.start_pos = new Point(0, 0);
        this.end_pos = null;
        this.selected_nodes = [];
        this.toggled_nodes = [];
        this.key_down = null;
    }

    MarqueeSelectionCommand.prototype.exec = function(e) {
        this.start_pos.x = e.sceneX;
        this.start_pos.y = e.sceneY;
        if(e.ctrlKey)
            this.key_down = 'ctrlKey';
        else if(e.shiftKey)
            this.key_down = 'shiftKey';
    }

    MarqueeSelectionCommand.prototype.deselectAll = function() {
        for (const node of this.selected_nodes) {
            node.deselected();
        }
        this.selected_nodes = [];
    }

    MarqueeSelectionCommand.prototype.toggleAll = function() {
        for (const node of this.toggled_nodes) {
            node.toggleSelection();
        }
        this.toggled_nodes = [];
    }

    MarqueeSelectionCommand.prototype.update = function(e) {
        this.end_pos = new Point(e.sceneX, e.sceneY);
        let left = Math.min(this.start_pos.x, this.end_pos.x);
        let top = Math.min(this.start_pos.y, this.end_pos.y);
        let width = Math.abs(this.start_pos.x - this.end_pos.x);
        let height = Math.abs(this.start_pos.y - this.end_pos.y);
        let nodes = this.scene.collision_detector.getItemsOverlapWith(new Rect(left, top, width, height), Node);
        this.toggleAll();
        this.deselectAll();
        if(this.key_down == 'ctrlKey') {
            for (const node of nodes) {
                if (node.isSelected()) {
                    node.toggleSelection();
                    this.toggled_nodes.push(node);
                } else {
                    node.selected();
                    this.selected_nodes.push(node);
                }
            }
        }
        else if(this.key_down == 'shiftKey'){
            for (const node of nodes)
                if(!node.isSelected()) {
                    node.selected();
                    this.selected_nodes.push(node);
                }
        }
        else {
            this.scene.deselectSelectedNodes(true);
            for (const node of nodes) {
                node.selected();
                this.selected_nodes.push(node);
            }
        }
        this.scene.setToRender('nodes');
    }

    MarqueeSelectionCommand.prototype.end = function(e) {
        this.update(e);
        if(!this.key_down)
            this.scene.deselectSelectedNodes(this.selected_nodes.length>0);
        this.scene.selectNodes(this.selected_nodes, true)
    }

    MarqueeSelectionCommand.prototype.draw = function(ctx, lod) {
        ctx.globalAlpha = 1;
        if(!this.end_pos || (this.start_pos.x == this.end_pos.x && this.start_pos.y == this.end_pos.y))
            return;
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#000000";
        let view_scale = this.scene.viewScale();
        ctx.setLineDash([4 / view_scale, 2 / view_scale]);
        ctx.strokeRect(this.start_pos.x, this.start_pos.y, this.end_pos.x - this.start_pos.x, this.end_pos.y - this.start_pos.y);
    }

    Object.setPrototypeOf(MarqueeSelectionCommand.prototype, Command.prototype);

    function ConnectCommand(scene) {
        this.desc = "Create Connector";
        this.scene = scene;
        //the dummy_target_node always follow the mouse move
        this.dummy_target_node = {
            pos: new Point(0, 0),
            getConnectedAnchorPosInScene: function() {
                return this.pos
            }
        };
        this.from_node = null;
        this.from_slot = null;
        this.connector = null;
        this.last_hit = null;
        this.last_hit_slot = null;
    }

    ConnectCommand.prototype.exec = function(e, from_node, from_slot_name) {
        this.from_node = from_node;
        this.from_slot = from_node.getSlot(from_slot_name);
        this.last_hit_slot = this.from_slot;
        this.dummy_target_node.pos = new Point(e.sceneX, e.sceneY);
        // when unknown, drag from the reroute node
        this.connector_dir_unknown = this.from_slot.isInput() == undefined;
        // the link direction matters for rendering.
        if (this.from_slot.isInput())
            this.connector = new Connector(null, this.dummy_target_node, null, this.from_node, from_slot_name);
        else
            this.connector = new Connector(null, this.from_node, from_slot_name, this.dummy_target_node, null);
        this.connector.pluginRenderingTemplate(this.scene.rendering_template['Connector']);
    }

    ConnectCommand.prototype.setDragFrom = function(is_from_output) {
        if ((!is_from_output && this.connector.out_node == this.from_node) ||
            (is_from_output && this.connector.in_node == this.from_node)) {
            [this.connector.out_node, this.connector.in_node] = swap(this.connector.out_node, this.connector.in_node);
            [this.connector.out_slot_name, this.connector.in_slot_name] = swap(this.connector.out_slot_name, this.connector.in_slot_name);
        }
    }

    ConnectCommand.prototype.update = function(e, new_hit) {
        this.dummy_target_node.pos = new Point(e.sceneX, e.sceneY);
        if(this.from_node == new_hit.hit_item && this.last_hit_slot == new_hit.hit_component)
            return;
        if(this.last_hit_slot)
            this.last_hit_slot.mouseLeave();
        this.last_hit_slot = new_hit.hit_component;
        if(this.last_hit_slot)
            this.last_hit_slot.mouseEnter();
        this.last_hit = new_hit;
        let target_slot = new_hit.hit_component;
        if (target_slot instanceof NodeSlot) {
            if(this.connector_dir_unknown)
                this.setDragFrom((this.last_hit.hit_item instanceof RerouteNode) || this.last_hit.hit_component.isInput());
            this.connection = this.from_node.allowConnectTo(this.from_slot.name, new_hit.hit_item, target_slot);
        } else if(this.connector_dir_unknown)
             this.setDragFrom((e.sceneX - this.from_node.translate.x) >= this.from_slot.translate.x);
        this.scene.setToRender('nodes');
        this.scene.setToRender('connectors');
    }

    ConnectCommand.prototype.end = function(e) {
        if(this.last_hit && this.last_hit.is_hitted && this.last_hit.hit_component instanceof NodeSlot){
            if (this.connection.method == SlotConnectionMethod.null) {
                console.warn(this.connection.desc);
                this.support_undo = false;
                return;
            }
            this.end_state = {};
            let target_node = this.last_hit.hit_item;
            let target_slot = this.last_hit.hit_component;
            let existed_connector = null;
            if (this.connection.method == SlotConnectionMethod.replace) {
                let as_output = this.connection.args.node == this.from_node;
                let existed_connector = this.scene.getConnectorsLinkedToSlot(this.connection.args.node,
                    this.connection.args.slot, as_output)[0];
                if(existed_connector)
                    this.end_state['removed_connector'] = [
                        existed_connector.out_node, existed_connector.out_slot_name,
                        existed_connector.in_node, existed_connector.in_slot_name
                    ];
            }
            if (this.connector.out_node == this.dummy_target_node) {
                this.connector.out_node = target_node;
                this.connector.out_slot_name = target_slot.name;
            } else {
                this.connector.in_node = target_node;
                this.connector.in_slot_name = target_slot.name;
            }
            if(existed_connector)
               if(existed_connector.out_node == this.connector.out_node
                   && existed_connector.out_slot_name == this.connector.out_slot_name
                   && existed_connector.in_node == this.connector.in_node
                   && existed_connector.in_slot_name == this.connector.in_slot_name){
                   this.support_undo = false;
                   return;
               }
            this.scene.addConnector(this.connector, true);
            this.end_state['added_connector'] = [
                this.connector.out_node, this.connector.out_slot_name,
                this.connector.in_node, this.connector.in_slot_name
            ];
            this.support_undo = true;
            this.scene.setToRender('nodes');
            this.scene.setToRender('connectors');
        } else{
            this.support_undo = false;
        }
    }

    ConnectCommand.prototype.draw = function(ctx, lod) {
        if (this.connector)
            this.connector.draw(ctx, lod);
    }

    ConnectCommand.prototype.replaceConnector = function(to_add, to_remove) {
        if(to_add)
            this.scene.addConnector(new Connector(null, to_add[0], to_add[1], to_add[2], to_add[3]), true);
        // when scene adds connector will replace the old one, so we don't remove again here
        if(!to_add && to_remove){
            let connector = this.scene.getConnector(to_remove[0], to_remove[1], to_remove[2], to_remove[3]);
            this.scene.removeConnector(connector, true);
        }
        this.scene.setToRender('nodes');
        this.scene.setToRender('connectors');
    }

    ConnectCommand.prototype.undo = function() {
        this.replaceConnector(this.end_state['removed_connector'], this.end_state['added_connector']);
    }

    ConnectCommand.prototype.redo = function() {
        this.replaceConnector(this.end_state['added_connector'], this.end_state['removed_connector']);
    }

    Object.setPrototypeOf(ConnectCommand.prototype, Command.prototype);

    function ReconnectCommand(scene) {
        this.desc = "Create Connector";
        this.scene = scene;
        this.remove_connectors_command = new RemoveConnectorsCommand(this.scene);
        this.add_connector_commands = [];
    }

    ReconnectCommand.prototype.exec = function(e, connectors, change_in_slot) {
        this.remove_connectors_command.exec(connectors);
        for (const connector of connectors) {
            let command = new ConnectCommand(this.scene);
            command.exec(e,
                change_in_slot ? connector.out_node : connector.in_node,
                change_in_slot ? connector.out_slot_name : connector.in_slot_name);
            this.add_connector_commands.push(command);
        }
    }

    ReconnectCommand.prototype.update = function(e, new_hit) {
        for (const command of this.add_connector_commands) {
            command.update(e, new_hit);
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

    ReconnectCommand.prototype.draw = function(ctx, lod) {
        for (const command of this.add_connector_commands) {
            command.draw(ctx, lod);
        }
    }

    Object.setPrototypeOf(ReconnectCommand.prototype, Command.prototype);

    function AddNodeCommand(scene) {
        this.desc = "Add Node";
        this.scene = scene;
    }

    AddNodeCommand.prototype.exec = function(node) {
        let did = this.scene.addNode(node);
        if(!did){
            this.support_undo = false;
            return;
        }
        this.end_state = node;
    }

    AddNodeCommand.prototype.undo = function() {
        this.scene.removeNode(this.end_state);
    }

    AddNodeCommand.prototype.redo = function() {
        this.scene.addNode(this.end_state);
    }

    Object.setPrototypeOf(AddNodeCommand.prototype, Command.prototype);

    function CreateNodeCommand(scene) {
        this.desc = "Create Node";
        this.scene = scene;
        this._add_node = new AddNodeCommand(this.scene);
    }

    CreateNodeCommand.prototype.exec = function(node_type) {
        let node = type_registry.createNode(node_type);
        node.translate = new Point(this.scene.last_scene_pos.x, this.scene.last_scene_pos.y);
        this._add_node.exec(node);
        this.support_undo = this._add_node.support_undo;
        return node;
    }

    CreateNodeCommand.prototype.undo = function() {
        this._add_node.undo();
    }

    CreateNodeCommand.prototype.redo = function() {
        this._add_node.redo();
    }

    Object.setPrototypeOf(CreateNodeCommand.prototype, Command.prototype);

    function RemoveConnectorCommand(scene) {
        this.label = "Break Node Link(s)";
        this.desc = "Remove Connector";
        this.scene = scene;
    }

    RemoveConnectorCommand.prototype.exec = function(connectors) {
        let did = this.scene.removeConnectors(connectors);
        if(!did){
            this.support_undo = false;
            return;
        }
        this.end_state = connectors;
    }

    RemoveConnectorCommand.prototype.undo = function() {
        this.scene.addConnectors(this.end_state);
    }

    RemoveConnectorCommand.prototype.redo = function() {
        this.exec(this.end_state);
    }

    Object.setPrototypeOf(RemoveConnectorCommand.prototype, Command.prototype);

    function RemoveSelectedNodesCommand(scene) {
        this.label = "Delete";
        this.desc = "Delete current selections";
        this.scene = scene;
    }

    RemoveSelectedNodesCommand.prototype.exec = function() {
        this.end_state = {
            "nodes": this.scene.getSelectedNodes(),
            "connectors": this.scene.getConnectorsLinkedToNodes(this.scene.getSelectedNodes())
        }
        let did = this.scene.removeSelectedNodes();
        if(!did){
            this.support_undo = false;
        }
    }

    RemoveSelectedNodesCommand.prototype.undo = function() {
        this.scene.addNodes(this.end_state.nodes);
        this.scene.addConnectors(this.end_state.connectors)
    }

    RemoveSelectedNodesCommand.prototype.redo = function() {
        this.scene.removeNodes(this.end_state.nodes);
        this.scene.removeConnectors(this.end_state.connectors);
    }

    Object.setPrototypeOf(RemoveSelectedNodesCommand.prototype, Command.prototype);

    function RemoveConnectorsCommand(scene) {
        this.desc = "Delete connectors";
        this.scene = scene;
    }

    RemoveConnectorsCommand.prototype.exec = function(connectors) {
        this.end_state = connectors;
        let did = this.scene.removeConnectors(connectors);
        if(!did){
            this.support_undo = false;
        }
    }

    RemoveConnectorsCommand.prototype.undo = function() {
        this.scene.addConnectors(this.end_state)
    }

    RemoveConnectorsCommand.prototype.redo = function() {
        this.exec(this.end_state);
    }

    Object.setPrototypeOf(RemoveConnectorsCommand.prototype, Command.prototype);

    function RemoveAllConnectorsOfNodeCommand(scene) {
        this.desc = "Break Node Link(s)";
        this.scene = scene;
        this._removeConnectors = new RemoveConnectorCommand(this.scene);
    }

    RemoveAllConnectorsOfNodeCommand.prototype.exec = function() {
        let node = this.scene.hit_result.hit_item;
        if(!node)
            return;
        let connectors = this.scene.getConnectorsLinkedToNodes([node]);
        this._removeConnectors.exec(connectors);
        this.support_undo = this._removeConnectors.support_undo;
    }

    RemoveAllConnectorsOfNodeCommand.prototype.undo = function() {
        this._removeConnectors.undo();
    }

    RemoveAllConnectorsOfNodeCommand.prototype.redo = function() {
        this._removeConnectors.redo();
    }

    Object.setPrototypeOf(RemoveAllConnectorsOfNodeCommand.prototype, Command.prototype);

    function RemoveAllConnectorsOfSlotCommand(scene) {
        this.desc = "Break All Pin Link(s)";
        this.scene = scene;
        this._removeConnectors = new RemoveConnectorCommand(this.scene);
    }

    RemoveAllConnectorsOfSlotCommand.prototype.exec = function() {
        let node = this.scene.hit_result.hit_item;
        let slot = this.scene.hit_result.hit_component;
        let connectors = this.scene.getConnectorsLinkedToSlot(node, slot);
        this._removeConnectors.exec(connectors);
        this.support_undo = this._removeConnectors.support_undo;
    }

    RemoveAllConnectorsOfSlotCommand.prototype.undo = function() {
        this._removeConnectors.undo();
    }

    RemoveAllConnectorsOfSlotCommand.prototype.redo = function() {
        this._removeConnectors.redo();
    }

    Object.setPrototypeOf(RemoveAllConnectorsOfSlotCommand.prototype, Command.prototype);

    function PasteFromClipboardCommand(scene) {
        this.label = "Paste";
        this.desc = "Paste clipboard contents";
        this.scene = scene;
    }

    PasteFromClipboardCommand.prototype.exec = function() {
        this.end_state = {
            "config": localStorage.getItem("visual_programming_env_clipboard")
        };
        this.scene_x = this.scene.last_scene_pos.x || 0;
        this.scene_y = this.scene.last_scene_pos.y || 0;
        let created = this.scene.pasteFromClipboard(this.scene_x, this.scene_y, this.end_state.config);
        this.support_undo = !created.is_empty;
        this.end_state.nodes = created.nodes;
    }

    PasteFromClipboardCommand.prototype.undo = function() {
        this.scene.removeNodes(this.end_state.nodes);
    }

    PasteFromClipboardCommand.prototype.redo = function() {
        let created = this.scene.pasteFromClipboard(this.scene_x, this.scene_y, this.end_state.config);
        this.end_state.nodes = created.nodes;
    }

    Object.setPrototypeOf(PasteFromClipboardCommand.prototype, Command.prototype);

    function CutSelectedNodesCommand(scene) {
        this.label = "Cut";
        this.scene = scene;
        this.delete_command = new RemoveSelectedNodesCommand(this.scene);
        this.desc = this.delete_command.desc;
    }

    CutSelectedNodesCommand.prototype.exec = function() {
        let contents = this.scene.copySelectedNodeToClipboard();
        if(contents.is_empty) {
            this.support_undo = false;
            return;
        }
        this.delete_command.exec();
        this.support_undo = this.delete_command.support_undo;
    }

    CutSelectedNodesCommand.prototype.undo = function() {
        this.delete_command.undo();
    }

    CutSelectedNodesCommand.prototype.redo = function() {
        this.delete_command.redo();
    }

    Object.setPrototypeOf(CutSelectedNodesCommand.prototype, Command.prototype);

    function DuplicateNodeCommand(scene) {
        this.label = "Duplicate";
        this.scene = scene;
        this.paste_command = new PasteFromClipboardCommand(this.scene);
        this.desc = this.paste_command.desc;
    }

    DuplicateNodeCommand.prototype.exec = function() {
        let contents = this.scene.copySelectedNodeToClipboard();
        if(contents.is_empty) {
            this.support_undo = false;
            return;
        }
        this.paste_command.exec();
    }

    DuplicateNodeCommand.prototype.undo = function() {
        this.paste_command.undo();
    }

    DuplicateNodeCommand.prototype.redo = function() {
        this.paste_command.redo();
    }

    Object.setPrototypeOf(DuplicateNodeCommand.prototype, Command.prototype);

    function AddRerouteToConnectorCommand(scene) {
        this.scene = scene;
        this.add_command = new CreateNodeCommand(this.scene);
        this.reroute = undefined;
        this.reroute_pos = undefined;
        this.output_connector = undefined;
        this.input_connector = undefined;
        this.origin_connector = undefined;
        this.desc = "Create Reroute Node";
    }

    AddRerouteToConnectorCommand.prototype.replaceConnectors = function(connector){
        this.reroute_pos = [this.reroute.translate.x, this.reroute.translate.y];
        this.origin_connector = connector;
        this.input_connector = new Connector(null, connector.out_node, connector.out_slot_name, this.reroute, this.reroute.slot_name);
        this.scene.addConnector(this.input_connector, true);
        this.output_connector = new Connector(null, this.reroute, this.reroute.slot_name, connector.in_node, connector.in_slot_name),
        this.scene.addConnector(this.output_connector, true);
        this.scene.setToRender("nodes");
        this.scene.setToRender("connectors");
    }

    AddRerouteToConnectorCommand.prototype.exec = function(connector) {
        this.reroute = this.add_command.exec('RerouteNode');
        this.replaceConnectors(connector);
    }

    AddRerouteToConnectorCommand.prototype.undo = function() {
        this.add_command.undo();
        this.scene.addConnector(this.origin_connector);
    }

    AddRerouteToConnectorCommand.prototype.redo = function() {
        let old_pos = this.reroute_pos;
        this.add_command.redo();
        [this.reroute.translate.x, this.reroute.translate.y] = old_pos;
        this.replaceConnectors(this.origin_connector);
    }

    Object.setPrototypeOf(AddRerouteToConnectorCommand.prototype, Command.prototype);

    function View(scene) {
        this.scene = scene;
        // (pos_scene + translate) * scale = pos_view
        this.translate = new Point(0, 0);
        this.scale = 1;
        this.max_scale = 3;
        this.min_scale = 0.3;
        Object.defineProperty(this, "lod", {
            get() {return this.scale > (this.max_scale - this.min_scale) / 5.0 ? 0 : 1;}
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
        if (s == this.scale) return false;
        // keep the pivot point unchanged after scale
        pivot_in_view = pivot_in_view || this.scale_pivot();
        let pivot_before_scale = this.mapToScene(pivot_in_view);
        this.scale = s;
        debug_log(`scale to ${this.scale}`);
        if (Math.abs(this.scale - 1) < 0.01) this.scale = 1;
        let pivot_after_scale = this.mapToScene(pivot_in_view);
        this.addTranslate(pivot_after_scale.x - pivot_before_scale.x, pivot_after_scale.y - pivot_before_scale.y);
        return true;
    };

    //the area of the scene visualized by this view
    View.prototype.sceneRect = function() {
        return this.mapRectToScene(this.viewport);
    };

    function moveItemToFrontInArray(array, item){
        let i = array.indexOf(item);
        if(i>0)
            array.unshift(array.splice(i, 1)[0]);
    }

    function removeItemInArray(array, item){
        let index = array.indexOf(item);
        if(index> -1)
            array.splice(index, 1);
    }

    function HitResult(is_hitted, hit_item, hit_local_x, hit_local_y, hit_component) {
        this.is_hitted = is_hitted;
        this.hit_item = hit_item;
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
       this.clear();
    };

    CollisionDetector.prototype.clear = function() {
        this._boundingRectsExcludeComments = {};
        this._boundingRectsOfComments = {};
        this._idsOfNoCommentsWithDescendZOrder = [];
        this._idsOfCommentsWithDescendZOrder = [];
    };

    CollisionDetector.prototype.addExcludeCommentsBoundingRect = function(rect) {
        this._boundingRectsExcludeComments[rect.owner.id] = rect;
        if(rect.owner instanceof Connector)
            this._idsOfNoCommentsWithDescendZOrder.push(rect.owner.id);
        else
            this._idsOfNoCommentsWithDescendZOrder.unshift(rect.owner.id);
    };

    CollisionDetector.prototype.addCommentNodeBoundingRect = function(rect) {
        this._boundingRectsOfComments[rect.owner.id] = rect;
        this._idsOfCommentsWithDescendZOrder.unshift(rect.owner.id);
    };

    CollisionDetector.prototype.allBoundingRectIDs = function (){
        return this._idsOfNoCommentsWithDescendZOrder.concat(this._idsOfCommentsWithDescendZOrder);
    }

    CollisionDetector.prototype.allBoundingRects = function (){
        return Object.values(this._boundingRectsExcludeComments).concat(Object.values(this._boundingRectsOfComments));
    }

    CollisionDetector.prototype.allZOrderedBoundingRects = function (){
        let z_ordered_nodes = [];
        for (const id of this._idsOfNoCommentsWithDescendZOrder) {
            z_ordered_nodes.push(this._boundingRectsExcludeComments[id]);
        }
        let z_ordered_comments = [];
        for (const id of this._idsOfCommentsWithDescendZOrder) {
            z_ordered_comments.push(this._boundingRectsOfComments[id]);
        }
        return z_ordered_nodes.concat(z_ordered_comments);
    }

    CollisionDetector.prototype.setTopZOrder = function(item) {
        if(item instanceof CommentNode)
            moveItemToFrontInArray(this._idsOfCommentsWithDescendZOrder, item.id);
        else
            moveItemToFrontInArray(this._idsOfNoCommentsWithDescendZOrder, item.id);
    }

    CollisionDetector.prototype.addBoundingRect = function(item) {
        if (!item) {
            console.warn("None object will not added for collision detection");
            return;
        }
        let rect = item.getBoundingRect();
        if (!rect) {
            console.warn(`The ${item} do not have bounding rectangle for collision detection`);
            return;
        }
        if (!rect.isValid()) {
            console.warn(`The ${item} has invalid bounding rectangle for collision detection`);
            return;
        }
        rect.owner = item;
        if (this.allBoundingRectIDs().includes(rect.owner.id))
            throw "The id of bounding rect already in used."
        if(item instanceof CommentNode)
            this.addCommentNodeBoundingRect(rect);
        else
            this.addExcludeCommentsBoundingRect(rect);
    };

    CollisionDetector.prototype.removeBoundingRect = function(item) {
        if(item instanceof CommentNode){
            removeItemInArray(this._idsOfCommentsWithDescendZOrder, item.id);
            delete this._boundingRectsOfComments[item.id];
        }
        else{
            removeItemInArray(this._idsOfNoCommentsWithDescendZOrder, item.id);
            delete this._boundingRectsExcludeComments[item.id];
        }
    };

    CollisionDetector.prototype.updateBoundingRect = function(item) {
        this.removeBoundingRect(item);
        this.addBoundingRect(item)
    };

    CollisionDetector.prototype.getHitResultAtPos = function(x, y, type) {
        let type_match = type ? rect.owner instanceof type : true;
        for (const rect of this.allZOrderedBoundingRects()) {
            if (type_match && rect.isInside(x, y)){
                if(rect.owner.isCollided == undefined || rect.owner.isCollided(x, y)){
                    if(rect.owner instanceof Connector)
                        return new HitResult(true, rect.owner, undefined, undefined, undefined);
                    const local_pos = new Point(x - rect.owner.translate.x, y - rect.owner.translate.y);
                    const hit_component = this.getHitComponentAtPos(local_pos.x, local_pos.y, rect.owner);
                    return new HitResult(true, rect.owner, local_pos.x, local_pos.y, hit_component);
                }
            }
        }
        return new HitResult(false);
    }

    CollisionDetector.prototype.getHitComponentAtPos = function(x, y, item) {
        if(!item.collidable_components)
            return null;
        for (const comp of Object.values(item.collidable_components)) {
            if (comp.getBoundingRect().isInside(x, y)) {
                return comp;
            }
        }
        return null;
    };

    CollisionDetector.prototype.getItemsOverlapWith = function(rect, include_type, exclude_type, z_order_ascend) {
        let intersections = [];
        for (const r of this.allZOrderedBoundingRects()) {
            let include = include_type ? r.owner instanceof include_type : true;
            let exclude = exclude_type? r.owner instanceof exclude_type: false;
            if (include && (!exclude) && rect.isIntersectWith(r)) {
                intersections.push(r.owner);
            }
        }
        if(z_order_ascend)
            intersections.reverse();
        return intersections;
    }

    CollisionDetector.prototype.getItemsInside = function(rect, include_type) {
        let insides = [];
        for (const r of this.allBoundingRects()) {
            let include = include_type ? r.owner instanceof include_type : true;
            if (include && r.isInsideRect(rect)) {
                insides.push(r.owner);
            }
        }
        return insides;
    }

    //API *************************************************
    //like rect but rounded corners
    if (typeof(window) != "undefined" && window.CanvasRenderingContext2D && !window.CanvasRenderingContext2D.prototype.roundRect) {
        window.CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radius, radius_low) {
            let top_left_radius = 0;
            let top_right_radius = 0;
            let bottom_left_radius = 0;
            let bottom_right_radius = 0;
            if (radius === 0) {
                this.rect(x, y, w, h);
                return;
            }
            radius_low = radius_low || radius;
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
            this.quadraticCurveTo(x + w, y + h, x + w - bottom_right_radius, y + h);
            //bottom left
            this.lineTo(x + bottom_left_radius, y + h);
            this.quadraticCurveTo(x, y + h, x, y + h - bottom_left_radius);
            //top left
            this.lineTo(x, y + top_left_radius);
            this.quadraticCurveTo(x, y, x + top_left_radius, y);
        };
    }

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

    function isPointOnCubicCurve(x, y, p0, p1, p2, p3, distance){
        // rearrange cubic bezier function to cubic function of t
        // p = p_0(1 - t)^3 + 3p_1t(1 - t)^2 + 3p_2t^2(1 - t) + p_3t^3
        // t^3(p_3 - 3p_2 + 3p_1 - p_0) + t^23(p_2 - 2p_1 + p_0) + t3(p_1 - p_0) + p_0 - p = 0
        function coefficient(v0, v1, v2, v3){
            let a = v3 - 3*v2 + 3*v1 - v0;
            let b = 3*(v2 - 2*v1 + v0);
            let c = 3*(v1 - v0);
            return [a, b, c]
        }
        let [a, b, c] = coefficient(p0.x, p1.x, p2.x, p3.x);
        let d = p0.x - x;
        let roots = solveCubic(a, b, c, d);
        [a, b, c] = coefficient(p0.y, p1.y, p2.y, p3.y);
        d = p0.y
        for(const t of roots){
            let y_on_curve = a*Math.pow(t, 3) + b*Math.pow(t, 2) + c*t + d;
            if(Math.abs(y - y_on_curve) < distance){
                return true;
            }
        }
        return false;
    }
    //from https://stackoverflow.com/questions/27176423/function-to-solve-cubic-equation-analytically
    function solveCubic(a, b, c, d) {
        if (Math.abs(a) < 1e-8) { // Quadratic case, ax^2+bx+c=0
            a = b; b = c; c = d;
            if (Math.abs(a) < 1e-8) { // Linear case, ax+b=0
                a = b; b = c;
                if (Math.abs(a) < 1e-8) // Degenerate case
                    return [];
                return [-b/a];
            }

            let D = b*b - 4*a*c;
            if (Math.abs(D) < 1e-8)
                return [-b/(2*a)];
            else if (D > 0)
                return [(-b+Math.sqrt(D))/(2*a), (-b-Math.sqrt(D))/(2*a)];
            return [];
        }

        // Convert to depressed cubic t^3+pt+q = 0 (subst x = t - b/3a)
        let p = (3*a*c - b*b)/(3*a*a);
        let q = (2*b*b*b - 9*a*b*c + 27*a*a*d)/(27*a*a*a);
        let roots;

        if (Math.abs(p) < 1e-8) { // p = 0 -> t^3 = -q -> t = -q^1/3
            roots = [Math.cbrt(-q)];
        } else if (Math.abs(q) < 1e-8) { // q = 0 -> t^3 + pt = 0 -> t(t^2+p)=0
            roots = [0].concat(p < 0 ? [Math.sqrt(-p), -Math.sqrt(-p)] : []);
        } else {
            let D = q*q/4 + p*p*p/27;
            if (Math.abs(D) < 1e-8) {       // D = 0 -> two roots
                roots = [-1.5*q/p, 3*q/p];
            } else if (D > 0) {             // Only one real root
                let u = Math.cbrt(-q/2 - Math.sqrt(D));
                roots = [u - p/(3*u)];
            } else {                        // D < 0, three roots, but needs to use complex numbers/trigonometric solution
                let u = 2*Math.sqrt(-p/3);
                let t = Math.acos(3*q/p/u)/3;  // D < 0 implies p < 0 and acos argument in [-1..1]
                let k = 2*Math.PI/3;
                roots = [u*Math.cos(t), u*Math.cos(t-k), u*Math.cos(t-2*k)];
            }
        }
        // Convert back from depressed cubic
        for (let i = 0; i < roots.length; i++)
            roots[i] -= b/(3*a);
        return roots;
    }

})(this);

//import './nodes/scipy.js'
(function(global) {
    let type_registry = global.VPE.TypeRegistry;

    function ImageIOImRead() {
        this._ctor();
        this.addInput("in_exec", "exec");
        this.addInput("path", "string");
        this.addOutput("out_exec", "exec");
        this.addOutput("image", "numpy.ndarray");
        this.title = "Image Read";
        this.type = "Image.Read";
        this.desc = "Read an image from the path.";
    }
    type_registry.registerNodeType("Image.Read", ImageIOImRead);

    function ImageIOImWrite() {
        this._ctor();
        this.addInput("in_exec", "exec");
        this.addInput("image", "numpy.ndarray");
        this.addOutput("out_exec", "exec");
        this.title = "Image Write";
        this.type = "Image.Write";
        this.desc = "Write an image to the specified file.";
    }
    type_registry.registerNodeType("Image.Write", ImageIOImWrite);

    function ImageShow() {
        this._ctor();
        this.addInput("in_exec", "exec");
        this.addInput("image", "numpy.ndarray");
        this.title = "Image Show";
        this.type = "Image.Show";
        this.desc = "Show an image.";
    }
    type_registry.registerNodeType("Image.Show", ImageShow);

    function ImageGaussianFilter() {
        this._ctor();
        this.addInput("in_exec", "exec");
        this.addInput("input", "numpy.ndarray");
        this.addInput("sigma", "number");
        this.addOutput("out_exec", "exec");
        this.addOutput("image", "numpy.ndarray");
        this.title = "Gaussian Filter";
        this.type = "Image.GaussianFilter";
        this.desc = "Gaussian filter";
    }

    type_registry.registerNodeType("Image.GaussianFilter", ImageGaussianFilter);

    function ImagePlusImage() {
        this._ctor();
        this.addInput("imageA", "numpy.ndarray");
        this.addInput("imageB", "numpy.ndarray");
        this.addOutput("image", "numpy.ndarray");
        this.type = "Image.ImagePlusImage";
        this.desc = "Image plus image";
    }
    ImagePlusImage.prototype.overrideRenderingTemplate = function (){
        this.title_bar = {
            to_render: false,
            color: "#a3a3fa",
            height: 25,
            font: "12px Arial",
            font_color: '#000000',
            text_to_border: 5
        };
        this.central_text = {
            to_render: true,
            width: 12,
            height: 10,
            color: "#000000",
            text: "+",
            font: "22px Arial",
        };
    }
    ImagePlusImage.prototype.overrideRenderingTemplateOfSlot = function(slot) {
        slot.to_render_text = false;
    };
    type_registry.registerNodeType("Image.ImagePlusImage", ImagePlusImage);

    function Image() {
        this._ctor();
        this.addOutput("image", "numpy.ndarray", null);
        this.type = "Image.Image";
        this.desc = "Image";
    }
    Image.prototype.overrideRenderingTemplate = function (){
        this.title_bar = {
            to_render: false,
            color: "#a3a3fa",
            height: 25,
            font: "12px Arial",
            font_color: '#000000',
            text_to_border: 5
        };
    }
    type_registry.registerNodeType("Image.Image", Image);
})(this);