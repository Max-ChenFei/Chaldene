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
          execute: function(args){
            return helper[i].exec(args._content);
          },
          isEnabled: function(args){
            return args._active;
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
      let that = this;
      this._search = null;
      function createLabel(name,search_results){
        let s = "";
        s+=name.slice(0,search_results[0].index);
        for(let i = 0;i<search_results.length-1;i++){
          s+="<b>" +search_results[i][0] + "</b>";
          s+=name.slice(search_results[i].index + search_results[i][0].length,search_results[i+1].index);
        }
        let i = search_results.length-1;
        s+="<b>" +search_results[i][0] + "</b>";
        s+=name.slice(search_results[i].index + search_results[i][0].length);
        return s;
      }
      function updateSearch(){
        if(!input.value){
          that._search = null;
          that.update();
          return;
        }

        that._search = {};

        for (const [category, group] of Object.entries(that._groups)){
          let s1 = [...category.matchAll(input.value)];
          let added = false;
          if(s1.length>0){
            that._search[category] = {name: createLabel(category, s1), list:[]}
            added = true;
          }

          for(let i = 0; i<group.list.length; i++){
            let member = group.list[i];
            let s2 = [...member.matchAll(input.value)];
            if(s2.length>0){
              if(!added){
                that._search[category] = {name: category, list:[]}
                added = true;
              }
              that._search[category].list.push(createLabel(member,s2));
              that._search[category].show = true;
            } else {
              if(added){
                that._search[category].list.push(member);
                that._search[category].show = group.show;
              }
            }

          }

        }
        that.update();

      }

      input.addEventListener("input",function(){
        updateSearch();
      });
      node.appendChild(input);
      input.placeholder = "Search...";

      this._list = document.createElement('div');
      node.appendChild(this._list);
      this._groups = {};

      this.addMember = function(category,name){
        if(!this._groups[category]){
          this._groups[category] = {name: category,show:true, list:[]};
        }
        this._groups[category].list.push(name);
      }
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
        let help = this._groups;
        if(this._search){
          if(Object.keys(this._search).length === 0){
            this._list.innerHTML = "No search results...";
            return;
          } else {
            help = this._search;
          }
        }
        for (const [category, group] of Object.entries(help)){
          let icon= document.createElement('i');
          icon.style.width = "1rem";
          icon.classList.add("fa");
          if(group.show)
          icon.classList.add("fa-chevron-down");
          else
          icon.classList.add("fa-chevron-right");
          icon.ariaHidden=true;
          let catTitle = document.createElement('p');
          catTitle.innerHTML = group.name;
          let catItem = document.createElement('div');

          let button = document.createElement('button')
          button.classList.add('addbutton')
          button.innerHTML = "Add...";

          let catName = document.createElement('div');
          catName.appendChild(icon);
          catName.appendChild(catTitle);
          catItem.classList.add('categoryName');

          catItem.appendChild(catName);
          catItem.appendChild(button);
          catName.onclick = function(){groupClick(group);};


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

  function _getWindowData(){
    return {
      pageXOffset: window.pageXOffset,
      pageYOffset: window.pageYOffset,
      clientWidth: document.documentElement.clientWidth,
      clientHeight: document.documentElement.clientHeight
    };
  }

  class SearchMenu extends Widget {
  constructor(graph){
      let node = document.createElement('div');

      super({ node: node });
      node.classList.add('SearchMenu');
      let input = document.createElement('input');
      let that = this;
      this._search = null;
      function createLabel(name,search_results){
        let s = "";
        s+=name.slice(0,search_results[0].index);
        for(let i = 0;i<search_results.length-1;i++){
          s+="<b>" +search_results[i][0] + "</b>";
          s+=name.slice(search_results[i].index + search_results[i][0].length,search_results[i+1].index);
        }
        let i = search_results.length-1;
        s+="<b>" +search_results[i][0] + "</b>";
        s+=name.slice(search_results[i].index + search_results[i][0].length);
        return s;
      }
      function updateSearch(){
        if(!input.value){
          that._search = null;
          that.update();
          return;
        }

        that._search = {};

        function addToSearch(groups,addEverything){
          let node = {};
          for (const [category, group] of Object.entries(groups)){
            let s1 = [...category.matchAll(input.value)];
            let added = false;
            if(group.list){
              let list = {}
              if(s1.length>0){
                added =true;
                node[category] = {name: createLabel(category, s1), list:{}}
                list = addToSearch(group.list,true);
              } else {
                list = addToSearch(group.list,addEverything);
              }
              if(Object.entries(list).length>0 || addEverything){
                if(!added)
                  node[category] = {name: category, list:list}
                else
                  node[category].list =list;

                node[category].show = true;
              }
            }
            else {
              if(s1.length>0){
                node[category] = createLabel(category, s1);
              }
              else if(addEverything){
                node[category] = category;
              }
            }
          }
          return node;
        }




        that._search = addToSearch(that._groups,false);
        that.update();

      }

      input.addEventListener("input",function(){
        updateSearch();
      });
      node.appendChild(input);
      input.placeholder = "Search...";

      this._list = document.createElement('div');
      node.appendChild(this._list);
      this._groups = {};

      this.addMember = function(category,name){

        function addMember(node,category,name){
          console.log(category);
          if(!Object.keys(category).length>0){
            if(node[name]){
              console.error("Member  was already added");
              return;
            } else {
              node[name] = name;
            }
          } else {
            if(!node[category[0]]){
              node[category[0]] = {name: category[0], list: {}, show: true};
            }
            addMember(node[category[0]].list, category.slice(1), name);
          }
        }
        addMember(this._groups, category,name);
      }
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
        this._list.classList.add("SearchList");
        this._list.style.maxHeight = "10rem";
        this._list.style.maxWidth = "10rem";
        node.style.width = "10rem";
        node.appendChild(this._list);
        let help = this._groups;
        if(this._search){
          if(Object.keys(this._search).length === 0){
            this._list.innerHTML = "No search results...";
            return;
          } else {
            help = this._search;
          }
        }
        let that = this;
        function addNodes(list, groups,indent){
          console.log(groups);
          for (const [category, group] of Object.entries(groups)){

            let d = document.createElement('div');
            d.style.paddingLeft = indent+1+"rem";
            d.classList.add("indentation");
            if(group.name){
              let icon= document.createElement('i');
              icon.style.width = "1rem";
              icon.classList.add("fa");
              if(group.show)
              icon.classList.add("fa-chevron-down");
              else
              icon.classList.add("fa-chevron-right");
              icon.ariaHidden=true;
              let catTitle = document.createElement('p');
              catTitle.innerHTML = group.name;
              let catItem = document.createElement('div');
              catItem.appendChild(d);
              catItem.appendChild(icon);
              catItem.appendChild(catTitle);
              catItem.classList.add('categoryName');
              catItem.onclick = function(){groupClick(group);};

              that._list.appendChild(catItem);
              if(group.show)
                addNodes(list,group.list,indent+1);
            } else {
              let p = document.createElement('p');
              p.innerHTML = group;
              let memberEl = document.createElement('div')
              memberEl.appendChild(d);
              memberEl.appendChild(p);
              memberEl.classList.add('memberEl');
              memberEl.onclick = function(){onclick(memberEl);};
              that._list.appendChild(memberEl);
            }
          }
        }

        addNodes(this._list, help, 0);
      }


      this.setFlag(Widget.Flag.DisallowLayout);
      this.addClass('content');
      this.title.label = 'Members of' + graph.name;
      this.title.closable = true;
      this.title.caption = 'Shows all the members in ' + graph.name;


      function addToMenu(category, list){
        for(let i = 0; i<list.length; i++){
          if(!list[i].name){
            console.log("heey",category, list[i]);
            that.addMember(category,list[i]);
          } else {
            addToMenu(category.concat([list[i].name]), list[i].value);
          }
        }
      }

      let gs = mockLiteGraphGetRegisteredNodes();
      addToMenu([],gs);


      this.update();


      this.addClass('lm-Menu');
      this.onBeforeAttach = Menu.prototype.onBeforeAttach;
      this.onAfterAttach = Menu.prototype.onAfterAttach;

      this._evtKeyDown = function(event){

      }

      function hit(e){
        let bb = node.getBoundingClientRect();

        let x = e.clientX;
        let y = e.clientY;

        return x>= bb.left &&
              x<= bb.left + bb.width &&
              y>=bb.top &&
              y<=bb.top+bb.height;

      }

      this._evtMouseDown = function(event){
        if(!hit(event)){
          this.close();
        }
      }


      this._evtMouseUp = function(event){

      }


      this._evtMouseMove = function(event){

      }

      this._evtMouseEnter = function(event){

      }

      this._evtMouseLeave = function(event){

      }

      this.handleEvent = function(event){
        switch (event.type) {
          case 'keydown':
            this._evtKeyDown(event);
            break;
          case 'mouseup':
            this._evtMouseUp(event);
            break;
          case 'mousemove':
            this._evtMouseMove(event);
            break;
          case 'mouseenter':
            this._evtMouseEnter(event);
            break;
          case 'mouseleave':
            this._evtMouseLeave(event);
            break;
          case 'mousedown':
            this._evtMouseDown(event);
            break;
          case 'contextmenu':
            event.preventDefault();
            event.stopPropagation();
            break;
        }
      }


    }




    close(){
      if(this.isAttached){
        Widget.detach(this);
      }
    }
    open(x,y){
      const windowData = _getWindowData();
      let px = windowData.pageXOffset;
      let py = windowData.pageYOffset;
      let cw = windowData.clientWidth;
      let ch = windowData.clientHeight;

      let forceX = false;
      let forceY = false;

      // Compute the maximum allowed height for the menu.
      let maxHeight = ch - (forceY ? y : 0);

      // Fetch common variables.
      let node = this.node;
      let style = node.style;

      // Clear the menu geometry and prepare it for measuring.
      style.opacity = '0';
      style.maxHeight = `${maxHeight}px`;
      //style.maxHeight = "20rem";

      // Attach the menu to the document.
      Widget.attach(this, document.body);

      // Measure the size of the menu.
      let { width, height } = node.getBoundingClientRect();

      // Adjust the X position of the menu to fit on-screen.
      if (!forceX && x + width > px + cw) {
        x = px + cw - width;
      }

      // Adjust the Y position of the menu to fit on-screen.
      if (!forceY && y + height > py + ch) {
        if (y > py + ch) {
          y = py + ch - height;
        } else {
          y = y - height;
        }
      }

      // Update the position of the menu to the computed position.
      style.transform = `translate(${Math.max(0, x)}px, ${Math.max(0, y)}px`;

      // Finally, make the menu visible on the screen.
      style.opacity = '1';

    }
  }

  function createSearchMenu(name){
    return new SearchMenu(name)
  }

  class GraphEditor extends Widget {
    constructor(graph) {
      let node = document.createElement('div');

      function createMenu(items,label='',inactive){

        let m = new Menu({commands:commands});
        for(let i =0; i<items.length; i++){
          //let args = items[i].args || {};
          let args = {}
          args._content = items[i].args;
          args._active = true;
          if(!items[i].submenu){
            //todo: we are seeting the args of the item itself?
            if(items[i].inactive || inactive){
              args._active=false;
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


      let canvas = document.createElement('canvas');
      canvas.style.margin = "0px";
      canvas.style.height="100%";
      canvas.style.width = "100%";
      node.appendChild(canvas);
      let ctx = canvas.getContext('2d');
      ctx.fillStyle = 'pink';
      ctx.fillRect(0,0,canvas.width,canvas.height);

      super({ node: node });

      let that = this;
      this.ctx = ctx;
      let serachMenu =createSearchMenu({name:"main"});
      node.addEventListener('contextmenu', function (event) {
        let cs = mockLiteGraphGetContextMenu(event);
        if(cs.type === "ContextMenu"){
          let m = createMenu(cs.items);
          m.open(event.clientX,event.clientY);
        } else {
          console.log("Search");
          serachMenu.open(event.clientX,event.clientY);
        }
        event.preventDefault();
        event.stopPropagation();
      });
      this.scene = new VPE.Scene(canvas);
      this.scene.start();
      // let fit_to_parent_callback = this.scene.fitToParentSize().bind(this.scene);
      // // The width of scene parent is zero at current frame
      // window.requestAnimationFrame(function(){
      //    fit_to_width_callback();
      // });
      // window.addEventListener("resize", fit_to_parent_callback);

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
    // this.ctx.canvas.height = this.ctx.canvas.clientHeight;
    // this.ctx.canvas.width = this.ctx.canvas.clientWidth;
    this.scene.resize(this.ctx.canvas.clientHeight, this.ctx.canvas.clientWidth);
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
      {name: "node_properties", label:"Node Properties",exec: function(args){ console.log("node props are " + args)}},
      {name: "hide_node", label:"Hide Node",exec: function(args){console.log("hiding node: " + args)}},
      {name: "delete_comment", label:"Delete Comment",exec: function(args){console.log("deleting comment: " + args)}},
    ]
  }

  function mockLiteGraphGetRegisteredNodes(){
    let nodes = [
    {name: "Math", value: ["Add","Multiply","Divide", {
      name: "Vector Math", value: ["Dot","Cross"]
    }]},
    {name: "Display", value: ["Image","String"]},
    {name: "Color", value: ["RGB2awkjdaiowjdoiawjawd awdawda wdiawhdBW",
    "HSV", "Contrast","Brightness"]}
    ];
    return nodes;
  }

  function mockLiteGraphGetContextMenu(e /* MouseEvent */){
    //make sure to return null when the graph is being dragged
    if(false)
    return {
      type: "ContextMenu",
      items: [
      {command: "add_node"},
      {command: "toggle_minimap"},
      {command: "node_properties", args:{name: "Add function", left: 23.1, right: 5.4}},
      {command: "hide_node", args: "Add func"},
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
    ]};

    return {
      type: "NodeSearch"
    };
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