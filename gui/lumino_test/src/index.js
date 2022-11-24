define(['@lumino/commands', '@lumino/widgets'], function (
  lumino_commands,
  lumino_widgets
) {


  const CommandRegistry = lumino_commands.CommandRegistry;
  const BoxPanel = lumino_widgets.BoxPanel;
  const CommandPalette = lumino_widgets.CommandPalette;
  const ContextMenu = lumino_widgets.ContextMenu;
  const DockPanel = lumino_widgets.DockPanel;
  const Menu = lumino_widgets.Menu;
  const MenuBar = lumino_widgets.MenuBar;
  const Widget = lumino_widgets.Widget;

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

      this._list = document.createElement('div');
      node.appendChild(this._list);
      this._groups = {};

      this.addMember = function(category,name){
        if(!this._groups[category]){
          this._groups[category] = [];
        }
        this._groups[category].push(name);
      }

      this.update = function(){
        this._list.remove();
        this._list = document.createElement('div');
        node.appendChild(this._list);
        for (const [category, members] of Object.entries(this._groups)){
          let catTitle = document.createElement('p');
          catTitle.innerHTML = category;
          catTitle.classList.add('categoryName');
          this._list.appendChild(catTitle);
          for(let i = 0; i<members.length; i++){
            let memberEl = document.createElement('p');
            memberEl.innerHTML = members[i];
            memberEl.classList.add('memberEl');

            this._list.appendChild(memberEl);
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
      super({ node: GraphEditor.prototype.createNode() });
      this.setFlag(Widget.Flag.DisallowLayout);
      this.addClass('content');
      this.addClass('blue');
      this.title.label = 'Graph: ' + graph.name;
      this.title.closable = true;
      this.title.caption = 'Long description for: ' + graph.name;
    }
  }

  GraphEditor.prototype = Object.create(Widget.prototype);

  GraphEditor.prototype.createNode = function () {
    let node = document.createElement('div');
    let content = document.createElement('div');
    let input = document.createElement('input');
    input.placeholder = 'Placeholder...';
    content.appendChild(input);
    node.appendChild(content);
    return node;
  };

  GraphEditor.prototype.inputNode = function () {
    return this.node.getElementsByTagName('input')[0];
  };

  GraphEditor.prototype.onActivateRequest = function (msg) {
    if (this.isAttached) {
      this.inputNode().focus();
    }
  };

  function main(){
    createCommands();
    let c = new ContextMenu({commands:commands});
    c.addItem({command:"file:new",selector:".content"});
    c.addItem({command:"file:load",selector:"*"});

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