define(['@lumino/commands', '@lumino/widgets'], function (
  lumino_commands,
  lumino_widgets,
) {


  const CommandRegistry = lumino_commands.CommandRegistry;
  const BoxPanel = lumino_widgets.BoxPanel;
  const CommandPalette = lumino_widgets.CommandPalette;
  const ContextMenu = lumino_widgets.ContextMenu;
  const DockPanel = lumino_widgets.DockPanel;
  const Menu = lumino_widgets.Menu;
  const MenuBar = lumino_widgets.MenuBar;
  const Widget = lumino_widgets.Widget;
  //const LiteGraph = litegraph.LiteGraph;
  const commands = new CommandRegistry();





  function createBar(){
    let bar = new MenuBar();

    let file = new Menu({commands:commands});
    file.title.label = "File";
    file.addItem({command: "file:new"})
    file.addItem({command: "file:load"})
    file.title.mnemonic = 0;

    let edit = new Menu({commands:commands});
    edit.addItem({command: "file:load"})
    edit.title.label = "Edit";
    edit.title.mnemonic = 0;

    bar.addMenu(file);
    bar.addMenu(edit);
    return bar;
  }

  function createDock(){

    let main = new BoxPanel({ direction: 'left-to-right', spacing: 0 });
    let dock = new DockPanel({tabsConstrained: true});
    //let r1 = createGraphEditor({name:"name"});
    //let r2 = createGraphEditor({name:"name"});
    //dock.addWidget(r1);
    //dock.addWidget(r2);

    dock.addWidget(createEditor({name:"main"}))
    dock.addWidget(createEditor({name:"func1"}))
    main.addWidget(dock);
    main.id = 'main';
    window.onresize = function () {
      main.update();
    };
    return main;
  }

  function createEditor(graph){
    let dock = new DockPanel({tabsConstrained: true});
    dock.id = graph+'dock__';

    let r1 = createMembersPanel(graph);
    let r2 = createGraphEditor(graph);
    let r3 = createPropertiesPanel(graph);
    r1.source = dock;
    r2.source = dock;
    r3.source = dock;
    dock.addWidget(r1);
    dock.addWidget(r2,{ mode: 'split-right', ref: r1 });
    dock.addWidget(r3,{ mode: 'split-right', ref: r2 });
    dock.addClass('content');

    dock.title.label = graph.name;
    dock.title.closable = true;
    dock.title.caption = "'" + graph.name +"'" + " edit window";
    return dock;

  }

  function createMembersPanel(graph){
    return new MembersPanel(graph);
  }
  function createGraphEditor(graph){
    return new GraphEditor(graph);
  }
  function createPropertiesPanel(graph){
    return new PropertiesPanel(graph);
  }

  function createCommands(){
    commands.addCommand('file:new',{
      label: "New",
      mnemonic: 0,
      execute: function(){
        console.log('New file');
      }
    });
    commands.addCommand('file:load',{
      label: "Load",
      mnemonic: 0,
      execute: function(){
        console.log('New file');
      }
    });

    let helper = mockLiteGraphGetCommands();
    for(let i = 0; i< helper.length; i++){
      commands.addCommand(
        "litegraph:"+helper[i].name,{
          label: helper[i].label,
          mnemonic:0,
          execute: helper[i].exec,
          isEnabled: function(arg){
            return arg.__active__;
          }
        }
      )
    }
  }
  class PropertiesPanel extends Widget {
    constructor(graph) {
      super({ node: PropertiesPanel.prototype.createNode() });
      this.setFlag(Widget.Flag.DisallowLayout);
      this.addClass('content');
      this.addClass('red');
      this.title.label = 'Properties of' + graph.name;
      this.title.closable = true;
      this.title.caption = 'Properties panel for ' + graph.name;
    }
  }
  PropertiesPanel.prototype = Object.create(Widget.prototype);

  PropertiesPanel.prototype.createNode = function () {
    let node = document.createElement('div');
    let content = document.createElement('div');
    let input = document.createElement('input');
    input.placeholder = 'Placeholder...';
    content.appendChild(input);
    node.appendChild(content);
    return node;
  };

  PropertiesPanel.prototype.inputNode = function () {
    return this.node.getElementsByTagName('input')[0];
  };

  PropertiesPanel.prototype.onActivateRequest = function (msg) {
    if (this.isAttached) {
      this.inputNode().focus();
    }
  };

  class MembersPanel extends Widget {
    constructor(graph) {
      let node = document.createElement('div');

      super({ node: node });
      node.classList.add('membersPanel');
      let input = document.createElement('input');
      node.appendChild(input);
      input.placeholder = "Search...";

      this._list = document.createElement('div');
      node.appendChild(this._list);
      this._groups = {};

      this.addMember = function(category,name){
        if(!this._groups[category]){
          this._groups[category] = {show:true, list:[]};
        }
        this._groups[category].list.push(name);
      }
      let that = this;
      let prevObj = null;

      function onclick(obj){
        if(prevObj){
          prevObj.classList.remove("selected");
        }
        prevObj = obj;
        obj.classList.add("selected");
      }

      function groupClick(group){
        group.show = !group.show;
        that.update();
      }

      this.update = function(){
        this._list.remove();
        this._list = document.createElement('div');
        node.appendChild(this._list);
        for (const [category, group] of Object.entries(this._groups)){
          let icon= document.createElement('i');
          icon.classList.add("fa");
          if(group.show)
          icon.classList.add("fa-chevron-down");
          else
          icon.classList.add("fa-chevron-right");
          icon.ariaHidden=true;
          let catTitle = document.createElement('p');
          catTitle.innerHTML = category;
          let catItem = document.createElement('div');

          catItem.appendChild(icon);
          catItem.appendChild(catTitle);
          catItem.classList.add('categoryName');
          catItem.onclick = function(){groupClick(group);};


          this._list.appendChild(catItem);
          if(group.show){
            for(let i = 0; i<group.list.length; i++){
              let memberEl = document.createElement('p');
              memberEl.innerHTML = group.list[i];
              memberEl.classList.add('memberEl');
              memberEl.onclick = function(){onclick(memberEl);};


              this._list.appendChild(memberEl);
            }
          }
        }
      }


      this.setFlag(Widget.Flag.DisallowLayout);
      this.addClass('content');
      this.title.label = 'Members of' + graph.name;
      this.title.closable = true;
      this.title.caption = 'Shows all the members in ' + graph.name;

      if(graph.name==='main'){
        this.addMember('Inputs','var1');
        this.addMember('Inputs','var2');
        this.addMember('Inputs','var3');
        this.addMember('Outputs','out1');
        this.addMember('Outputs','out2');
        this.addMember('Functions','func1');
      } else {
        this.addMember('Inputs','x');
        this.addMember('Outputs','y1');
        this.addMember('Outputs','y2');
      }
      this.update();
    }
  }


  class GraphEditor extends Widget {
    constructor(graph) {
      let node = document.createElement('div');

      function createMenu(items,label='',inactive){

        let m = new Menu({commands:commands});
        for(let i =0; i<items.length; i++){
          let args = items[i].args || {};
          args.__active__=true;
          if(!items[i].submenu){
            //todo: we are seeting the args of the item itself?
            if(items[i].inactive || inactive){
              args.__active__=false;
            }
            m.addItem({
              command: "litegraph:"+items[i].command,
              args: args
            });
          } else {
            m.addItem({type: 'submenu',
            submenu: createMenu(items[i].submenu.items,
                              items[i].submenu.label,items[i].inactive)});
          }

        }
        m.title.label = label;
        m.title.mnemonic = 0;
        return m;
      }

      node.addEventListener('contextmenu', function (event) {
        let cs = mockLiteGraphGetContextMenu();
        let m = createMenu(cs);


        m.open(event.clientX,event.clientY);
        event.preventDefault();
        event.stopPropagation();
      });
      let canvas = document.createElement('canvas');
      canvas.style.margin = "0px";
      canvas.style.height="100%";
      canvas.style.width = "100%";
      node.appendChild(canvas);
      let ctx = canvas.getContext('2d');
      ctx.fillStyle = 'pink';
      ctx.fillRect(0,0,canvas.width,canvas.height);

      super({ node: node });
      this.ctx = ctx;
      this.graph = new LiteGraph.LGraph();
      this.graph_canvas = new LiteGraph.LGraphCanvas(canvas, this.graph, {skip_events:false});
      this.setFlag(Widget.Flag.DisallowLayout);
      this.addClass('content');
      this.addClass('blue');
      this.title.label = 'Graph: ' + graph.name;
      this.title.closable = true;
      this.title.caption = 'Long description for: ' + graph.name;
    }

  }

  GraphEditor.prototype = Object.create(Widget.prototype);



  GraphEditor.prototype.onResize = function(){
    this.ctx.canvas.height = this.ctx.canvas.clientHeight;
    this.ctx.canvas.width = this.ctx.canvas.clientWidth;
/*
    this.ctx.fillStyle = 'pink';
    this.ctx.fillRect(0,0,this.ctx.canvas.width,this.ctx.canvas.height);

    this.ctx.fillStyle = 'red';
    this.ctx.fillRect(0,1,this.ctx.canvas.width,this.ctx.canvas.height-2);
*/
  }


  //TODO: submenus
  function mockLiteGraphGetCommands(){
    return [
      {name: "copy_node",label:"Copy",exec: function(){ console.log("copying node")}},
      {name: "paste_node",label:"Paste",exec: function(){ console.log("pasting node")}},
      {name: "test1",label:"Test 1",exec: function(){ console.log("testing 1")}},
      {name: "test2",label:"Test 2",exec: function(){ console.log("testing 2")}},
      {name: "test3",label:"Test 3",exec: function(){ console.log("testing 3")}},
      {name: "add_node",label:"Add Node",exec: function(){ console.log("adding node")}},
      {name: "toggle_minimap",label:"Toggle Minimap",exec: function(){ console.log("toggling minimap")}},
      {name: "node_properties", label:"Node Properties",exec: function(args){ console.log("node props are " + args.content)}},
      {name: "hide_node", label:"Hide Node",exec: function(args){console.log("hiding node: " + args.content)}},
      {name: "delete_comment", label:"Delete Comment",exec: function(args){console.log("deleting comment: " + args.content)}},
    ]
  }
  function mockLiteGraphGetContextMenu(){
    return [
      {command: "add_node"},
      {command: "toggle_minimap"},
      {command: "node_properties", args:{content:{name: "Add function", left: 23.1, right: 5.4}}},
      {command: "hide_node", args: {content:"Add func"}},
      {submenu: {
        label: "Edit...",
        items: [
          {command: "copy_node"},
          {command: "paste_node"},
        ]
      }},
      {
        inactive: true,
        submenu: {
          label: "Testing...",
          items: [
            {command: "test1"},
            {command: "test2"},
            {command: "test3"},
          ]
        }
      }
    ]
  }

  function main(){
    createCommands();
    let c = new ContextMenu({commands:commands});
    c.addItem({command:"file:new",selector:".content"});
    c.addItem({command:"file:load",selector:"*"});

    let canvasCM = null;

    document.addEventListener('contextmenu', function (event) {
      if (c.open(event)) {
        event.preventDefault();
      }
    });

    let bar = createBar();
    let dock = createDock();
    Widget.attach(bar,document.body);
    Widget.attach(dock,document.body);
  }


  return main;


})