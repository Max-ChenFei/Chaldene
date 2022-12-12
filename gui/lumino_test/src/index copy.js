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
  
  class ContentWidget extends Widget {
    constructor(name) {
      super({ node: ContentWidget.prototype.createNode() });
      this.setFlag(Widget.Flag.DisallowLayout);
      this.addClass('content');
      this.addClass(name.toLowerCase());
      this.title.label = name;
      this.title.closable = true;
      this.title.caption = 'Long description for: ' + name;
    }
  }

  ContentWidget.prototype = Object.create(Widget.prototype);

  ContentWidget.prototype.createNode = function () {
    let node = document.createElement('div');
    let content = document.createElement('div');
    let input = document.createElement('input');
    input.placeholder = 'Placeholder...';
    content.appendChild(input);
    node.appendChild(content);
    return node;
  };

  ContentWidget.prototype.inputNode = function () {
    return this.node.getElementsByTagName('input')[0];
  };

  ContentWidget.prototype.onActivateRequest = function (msg) {
    if (this.isAttached) {
      this.inputNode().focus();
    }
  };


  function createBar(){
    let bar = new MenuBar();
    
    let file = new Menu({commands:commands});
    file.addItem({command: "new_file"})
    file.addItem({command: "load_file"})
    
    
    let edit = new Menu({commands:commands});
    
    bar.addMenu(file);
    bar.addMenu(edit);
    return bar;
  }

  function createDock(){
    let dock = new DockPanel({tabsConstrained: true});
    dock.addWidget(createGraphPanel({name:"main"}))
    dock.addWidget(createGraphPanel({name:"func1"}))

    return dock;
  }

  function createGraphPanel(graph){
    let dock = new DockPanel({tabsConstrained: true});
    let r1 =  createCanvasDisplay();
    r1.source = dock;
    let r2 = new SearchableMenuWidget("Members");
    r2.source = dock
    dock.addWidget(r2);
    dock.addWidget(r1);
    
    dock.title.label = graph.name;
    dock.title.closable = true;
    dock.title.caption = "'" + graph.name +"'" + " edit window";
    return dock;

  }

  function createCanvasDisplay(){
    let r1 = new ContentWidget('Graph');
    return r1;
  }

  function createCanvasPanel(){
    
  }

  function createMembersPanel(){
    let panel = new CommandPalette
  }

  function createContextMenu(){

  }

  function createCommands(){
    commands.addCommand('new_file',{
      label: "New",
      mnemonic: 0,
    });
    commands.addCommand('load_file',{
      label: "Load",
      mnemonic: 0,
    });
  }

  class SearchableMenuWidget extends Widget {
    constructor(name) {
      let node = document.createElement('div');
      let input = document.createElement('input');
      node.appendChild(input);



      super({ node: node });
      this.setFlag(Widget.Flag.DisallowLayout);
      this.addClass('content');
      this.addClass(name.toLowerCase());
      this.title.label = name;
      this.title.closable = true;
      this.title.caption = 'Shows all the nodes in the scene' + name;

      this.requiresUpdate = false;

      this.addGroup = function(itemName, parent =name){

      }
      this.addItem = function(itemName, groupName=name){

      }

      


      this.update = function(){
        if(!this.requiresUpdate){
          return;
        }
        this.node;

        this.requiresUpdate = false;
      }
    }
  }

  function main(){
    createCommands();
    let bar = createBar();
    let dock = createDock();
    Widget.attach(bar,document.body);
    Widget.attach(dock,document.body);
  }


  return main;


})