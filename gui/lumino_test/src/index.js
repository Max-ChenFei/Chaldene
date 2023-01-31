/**
 * Node here refers to dom element
 */
define(['@lumino/commands', '@lumino/widgets'], function (lumino_commands, lumino_widgets) {
  class Signal{
      constructor(){
        this.slots = {};
      }
      connect(slot){
        this.slots[slot] = slot;
      }
      disconnect(slot){
        delete this.slots[slot];
      }
      emit(args){
        for (const slot of Object.values(this.slots)) {
          slot(args);
        }
      }
  }

  const Widget = lumino_widgets.Widget;
  const DockPanel = lumino_widgets.DockPanel;
  const ContextMenu = lumino_widgets.ContextMenu;
  const Menu = lumino_widgets.Menu;
  const CommandRegistry = lumino_commands.CommandRegistry;
  const commands = new CommandRegistry();

  function createMenuBar(commands){
    let bar = new lumino_widgets.MenuBar();
    let file = new Menu({commands:commands});
    file.title.label = "File";
    file.addItem({command: "file:new"});
    file.addItem({command: "file:load"});
    file.title.mnemonic = 0;

    let edit = new Menu({commands:commands});
    edit.addItem({command: "file:load"});
    edit.addItem({command: "editor:undo"});
    edit.addItem({command: "editor:redo"});
    edit.title.label = "Edit";
    edit.title.mnemonic = 0;

    bar.addMenu(file);
    bar.addMenu(edit);
    return bar;
  }

  function addNewEditor(editor_panel, tab_bar, data, name){
    editor_panel.editors_count +=1;
    let new_editor = new VPEEditor(data, name || `New Editor ${editor_panel.editors_count}`);
    let last_widget = tab_bar? tab_bar.titles[tab_bar.titles.length-1].owner : null;
    editor_panel.addWidget(new_editor, {ref: last_widget});
    editor_panel.activateWidget(new_editor);
    return new_editor;
  }
  function createFileMenu(){
    let fileBrowser = new FileBrowser();
    return fileBrowser;
  }

  function createEditorPanel(){
    let editor_panel = new DockPanel({tabsConstrained: true, addButtonEnabled : true});
    editor_panel.editors_count = 0;
    let fileMenu = createFileMenu();
    //let ed = addNewEditor(editor_panel);
    editor_panel.addWidget(fileMenu, {mode:"split-left"});
    editor_panel.addRequested.connect(addNewEditor);
    editor_panel.id = 'editorPanel';
    window.onresize = function () {
      editor_panel.update();
    };
    return editor_panel;
  }

  class VPEEditor extends DockPanel {
    constructor(data_graph, name, caption){
      super({tabsConstrained: true});
      this.data_graph = data_graph || new VPE.Graph();
      this.title.label = name;
      this.title.caption = caption || name;
      this.title.closable = true;
      this.setDefaultWidget();
      this.selected_member = null;
    }

    setDefaultWidget(){
      this.members_panel = new MembersPanel(this);
      this.members_panel.onmemberdblclick.connect(this.onClickMember.bind(this));
      this.addWidget(this.members_panel);
      this.graph_edtiors = {};
      let default_graph_editor = this.openGraphEditor('Graph Editor');
      this.graph_edtiors['Graph Editor'] = default_graph_editor;
      this.properties_panel = new PropertiesPanel(this);
      this.addWidget(this.graph_edtiors['Graph Editor'], { mode: 'split-right', ref: this.members_panel });
      this.addWidget(this.properties_panel, { mode: 'split-right', ref: default_graph_editor });
      this.addClass('content');
      let split_layout_config = [
          {currentIndex: 0, type: "tab-area", widgets: [this.members_panel]},
          {currentIndex: 0, type: "tab-area", widgets: [default_graph_editor]},
          {currentIndex: 0, type: "tab-area", widgets: [this.properties_panel]}];
      let default_layout_config = {main:  {
          type: 'split-area', orientation: 'horizontal',
          children: split_layout_config, sizes: [0.1, 0.8, 0.1]}};
      this.restoreLayout(default_layout_config);
    }

    onClickMember(args){
      let data = args.data;
      if(data instanceof VPE.Graph)
        this.openGraphEditor(data.name);
    }
    openGraphEditor(name){
      let graph_editor = this.graph_edtiors[name];
      if(!graph_editor) {
        graph_editor = new GraphEditor(this, name || 'Graph Editor');
        if(Object.values(this.graph_edtiors).length == 0){
          this.addWidget(graph_editor, { mode: 'split-right', ref: this.members_panel });
        }
        else{
          let ref_widget = Object.values(this.graph_edtiors)[0];
          let tab_bar = this.findTabBar(ref_widget);
          let last_widget = tab_bar.titles[tab_bar.titles.length-1].owner;
          this.addWidget(graph_editor, {ref: last_widget});
        }
        this.graph_edtiors[name] = graph_editor;
        graph_editor.onclose.connect(this.closeGraphEditor.bind(this));
      }
      this.activateWidget(graph_editor);
      return graph_editor;
    }

    findTabBar(widget){
      let tab_bars = this.layout.tabBars();
      for(const bar of tab_bars){
        if(bar.titles.includes(widget.title))
          return bar;
      }
      throw 'Reference widget is not in the layout.';
    }

    closeGraphEditor(args){
      delete this.graph_edtiors[args.name];
    }

    getDataMembers(){
      return this.data_graph.getMembers();
    }

    newDataMember(category){
      this.data_graph.addMember(category);
    }
  }

  class FileSystemObject{
    //type := 'dir'|'file'
    //name : String
    constructor(type, full_path){
      this.type = type;
      this.name = full_path[full_path.length-1];
      this.full_path = full_path;
    }
  }

 class Dir extends FileSystemObject {
    constructor(full_path){
      super("dir",full_path);
      this.files = {};
    }

  }
  class File extends FileSystemObject {
    constructor(full_path){
      super("file",full_path);
    }

  }

  function createPostCommand(action, content){
    console.log(content);
    return {action:action,content:content};
  }

  class FileSystemServer {
    constructor(url, port){
      this.url = url;
      this.port = port;
      this.base = this.url + ":"+this.port+"/";
    }

    open(filename, callback){
      function reqListener() {
        callback(this.responseText);
      }

      const req = new XMLHttpRequest();
      req.addEventListener("load", reqListener);
      req.open("GET", this.base+filename);
      req.send();
    }

    move(originalFilepath, newFilepath, callback=null){

      const req = new XMLHttpRequest();

      req.addEventListener("load", callback);
      req.open("POST", this.base);
      req.send(JSON.stringify(
        createPostCommand(
          "move",
          {src: originalFilepath, dst:newFilepath}
        )
      ));
    }

    save(filepath, fileContents){
      const req = new XMLHttpRequest();
      req.addEventListener("load", null);
      req.open("POST", this.base);
      req.send(JSON.stringify(
        createPostCommand(
          "save",
          {filepath: filepath, file:fileContents}
        )
      ));
    }
    delete(filepath){
      const req = new XMLHttpRequest();
      req.addEventListener("load", null);
      req.open("POST", this.base);
      req.send(JSON.stringify(
        createPostCommand(
          "delete",
          {filepath: filepath}
        )
      ));
    }

    //todo: change GETs to POSTs?
    listAllDirectories(callback){
      function reqListener() {
        let a = JSON.parse(this.responseText);
        console.log(this.responseText);
        callback(a);
      }

      const req = new XMLHttpRequest();
      req.addEventListener("load", reqListener);
      req.open("GET", this.base+"__get_directory_list");
      req.send();
    }
    listSingleDirectory(dir,callback){

      function reqListener() {
        let a = JSON.parse(this.responseText);
        console.log(this.responseText);
        callback(a);
      }

      const req = new XMLHttpRequest();
      req.addEventListener("load", reqListener);
      req.open("GET", this.base+"__get_directory?dir="+JSON.stringify(dir));
      req.send();

    }
  }

  class SearchBox {
    constructor(searchable){
      this.node = document.createElement("input");
      this.searchable = searchable;
      let that = this;
      this.node.addEventListener("input",function(){
          that.updateSearch();
      });

    }
    updateSearch(){
      this.searchable.search(this.node.value);
    }
  }
  class Searchable {
    search(pattern){
      throw new Error("NOT IMPLEMENTED")
    }
  }


  class FileList extends Searchable {
    constructor(){
      super();
      this.node = document.createElement("div");
    }
    search(pattern){
      //do nothing
    }

    updateNode(){

    }
  }

  class DirectoryNavigation extends Widget{
    constructor(parent){

      let node = DirectoryNavigation.prototype.createNode(parent);
      super({ node: node});

      this.parent = parent;
      this.mainDiv = document.createElement("div");
      node.appendChild(this.mainDiv);



    }

    display(){
      function sanitize(innerHTML){
        let a = document.createElement("div");
        a.innerText = innerHTML;
        return a.innerHTML;
      }
      let that = this;

      console.log(this.parent.currentDir);
      function getDirEl(i){
        let a =  document.createElement("div");
        if(i>0){
          a.innerHTML= sanitize(that.parent.currentDir[i]);
        } else {
          let icon = document.createElement("i");
          icon.classList.add("fa");
          icon.classList.add("fa-folder");
          a.appendChild(icon);
        }
        a.classList.add("vpe_fb_dir_button")
        a.onclick = function(){
          that.parent.openDir(that.parent.currentDir.slice(0,i+1))
        }
        return a;
      }


      this.mainDiv.innerHTML = "";
      for(let i =0; i<this.parent.currentDir.length; i++){
        console.log(this.parent.currentDir);
        this.mainDiv.append(getDirEl(i));

        let d = document.createElement("div");
        d.classList.add("vpe_fb_dir_sep");
        d.innerText = "/";
        this.mainDiv.append(d);
      }
    }
  }

  DirectoryNavigation.prototype.createNode = function(){
    let node = document.createElement('div');
    node.classList.add('DirectoryNavigation');
    return node;
  }

  class SearchableHelper extends Searchable{
    constructor(callback){
      super();
      this.searchPattern = null;
      this.callback = callback;
      this.active=false;
      console.log("Constructing!");
    }
    search(pattern){
      if(this.active){
        if(pattern.length==0){
          pattern = null;
        }
        this.searchPattern = pattern;
        this.callback(pattern);
      }
    }

    activate(active=true){
      this.active=active;
    }
  }


  class FileBrowser extends Widget {
    constructor() {
      let node = FileBrowser.prototype.createNode();
      super({ node: node});

      let that = this;

      document.addEventListener("keydown",function(event){
        if(event.key==="F2"){
          if(that.currentSelection && that.currentSelection.length>0){
            that.currentSelection[that.currentSelection.length-1].renameStart(that.server);
          }
        }
      })

      this.setFlag(Widget.Flag.DisallowLayout);
      this.addClass('content');
      this.addClass('vpe_fb');
      this.currentDir = ["."];
      this.currentSelection = [];
      let title_label = "File Browser";
      let title_caption = "Helps you browse through files";
      this.title.label = title_label;
      this.title.closable = true;
      this.title.caption = title_caption || title_label;


      this.searchable = new SearchableHelper(function(){that.display()});
      this.searchBox = new SearchBox(that.searchable);
      node.appendChild(this.searchBox.node);
      this.directoryNavigation = new DirectoryNavigation(this)
      node.appendChild(this.directoryNavigation.node);

      this.fileList = document.createElement("div");
      node.appendChild(this.fileList);
      this.fileList.classList.add("vpe_fb_filelist");
      this.server = new FileSystemServer("http://localhost",8080);

      this.openDir(this.currentDir);
      this.searchable.activate();
      /*
      this.server.listAllDirectories(function(fileStructure){
        that.openDir(fileStructure);
      });*/

    }



    updateFileStructure(base_dir){
      if(base_dir.type !== "dir")
        console.error("bad base dir");

      function getNode(path,obj){
        if(obj.type === "file"){
          return new File(path.concat([obj.name]));
        }
        let dir = new Dir(path.concat([obj.name]));
        for(let i = 0; i<obj.files.length; i++){
          dir.files[obj.files[i].name]=getNode(path.concat([obj.name]),obj.files[i]);
        }
        return dir;
      }

      this.fileStructure = getNode([],base_dir);
      this.display();
    }
    display(){
      let current = this.fileStructure;

      for(let i = 1; i<this.currentDir.length; i++){
        current = current.files[this.currentDir[i]];
      }

      this.fileList.innerHTML = "";
      for(const file of Object.values(current.files)){
        let node = this.getHTMLObject(file);
        if(node==null)
          continue;
        this.fileList.appendChild(node);
      }
      this.directoryNavigation.display();
    }

    getFileHTMLObject(fileObj){

      let that = this;
      let node = document.createElement("div");
      node.classList.add("vpe_fb_file_obj");
      let icon = document.createElement("i");
      icon.classList.add("fa");
      icon.classList.add("fa-solid");
      icon.classList.add("fa-file");
      node.appendChild(icon)
      let name = this.getFilteredName(fileObj.name);
      if(name==null){
        return null;
      }
      node.appendChild(name);

      node.onclick = function(){
        that.select(node);
      }
      node.ondblclick = function(){
        that.open(fileObj.full_path);
      }

      node.name_element = name;
      return node;
    }

    getHTMLObject(fileobj){
      let that = this;
      console.log(fileobj);
      let node;
      if(fileobj.type === "dir"){
        node= this.getDirHTMLObject(fileobj);
      } else {
        node= this.getFileHTMLObject(fileobj);
      }
      if(node==null){
        return null;
      }


      node.renameStart = function(){
        this.isRenaming = true;
        this.oldName = this.name_element.innerText;

        this.editableName = document.createElement("input");
        this.editableName.value = this.oldName;

        this.editableName.addEventListener("blur", function(){
          node.renameEnd();
        });

        this.name_element.replaceWith(this.editableName);
        this.editableName.focus();
        this.editableName.select();


      }
      node.renameEnd=function(){
        this.name_element.innerText = this.editableName.value;
        this.editableName.replaceWith(this.name_element);
        if(this.oldName===this.editableName.value){
          return;
        }
        that.rename(fileobj, this.name_element.innerText);
      }
      return node;
    }
    pathToString(path){
      let s = path[0];
      for(let i = 0; i<path.length; i++){
        s+="/"+path[i];
      }
      return s;
    }
    open(filepath){
      this.server.open(this.pathToString(filepath), function(payload){
        console.log("Opened file!" + (payload));
      });
    }

    rename(fileobj,new_name){
      let filepath = fileobj.full_path;
      let a = filepath.slice(0,filepath.length-1).concat([new_name]);
      fileobj.full_path = a;
      console.log(filepath, new_name);

      this.server.move(this.pathToString(filepath),this.pathToString(a));
    }

    openDir(path){
      console.log(path);
      this.currentDir = path;

      let that = this;

      this.server.listAllDirectories(
        function(fileStructure){
          that.updateFileStructure(fileStructure);
        }
      );

    }

    getFilteredName(str){

      let pattern = this.searchable.searchPattern;
      function sanitize(innerHTML){
        let a = document.createElement("div");
        a.innerText = innerHTML;
        return a.innerHTML;
      }

      str=sanitize(str);


      if(this.searchable.searchPattern == null){
        let node = document.createElement("p");
        node.innerHTML = str;
        return node;
      }
      let search_results = [...str.matchAll(pattern)];
      if(search_results.length==0){
        return null;
      }

      let node = document.createElement("p");
      let s = "";
      s+=str.slice(0,search_results[0].index);
      for(let i = 0;i<search_results.length-1;i++){
        s+="<b>" +search_results[i][0] + "</b>";
        s+=str.slice(search_results[i].index + search_results[i][0].length,search_results[i+1].index);
      }
      let i = search_results.length-1;
      s+="<b>" +search_results[i][0] + "</b>";
      s+=str.slice(search_results[i].index + search_results[i][0].length);
      node.innerHTML=s;
      return node;

    }

    getDirHTMLObject(fileObj){

      let name = this.getFilteredName(fileObj.name);
      if(name==null){
        return null;
      }
      let that = this;
      let node = document.createElement("div");
      node.classList.add("vpe_fb_file_obj");
      let icon = document.createElement("i");
      icon.classList.add("fa");
      icon.classList.add("fa-folder");
      icon.classList.add("fa-solid");
      node.appendChild(icon);
      node.appendChild(name);
      node.onclick = function(event){
        that.select(node,event);
      }
      node.ondblclick = function(){
        that.openDir(fileObj.full_path);
      }

      node.name_element = name;

      return node;
    }



    select(node,event){
      //todo: shift select
      if(!node.selected){
        this.unselectAll();
        node.classList.add("selected");
        node.selected = true;
        this.currentSelection.push(node);
      }

    }
    unselectAll(){
      for(let i = 0; i<this.currentSelection.length; i++){
        this.currentSelection[i].classList.remove("selected");
        this.currentSelection[i].selected = false;
      }
      this.currentSelection = [];
    }

  }

  FileBrowser.prototype.createNode = function(){
    let node = document.createElement('div');
    node.classList.add('fileBrowserPanel');
    return node;
  }

  class Panel extends Widget {
    constructor(parent_widget, title_label, title_caption) {
      super({});
      this.setParentWidget(parent_widget);
      this.setWidgetTitle(title_label, title_caption);
      this.setWidgetStyle();
      this.addSubNodesTo(this.node);
    }

    setWidgetStyle(){
      this.setFlag(Widget.Flag.DisallowLayout);
      this.addClass('content');
    }

    setWidgetTitle(title_label, title_caption){
      this.name = title_label;
      this.title.label = this.name;
      this.title.closable = true;
      this.title.caption = title_caption || title_label;
    }

    setParentWidget(widget){
      this.source = widget;
    }

    getParentWidget(){
      return this.source;
    }

    addSubNodesTo(parent_node){
    }
  }

  class PropertiesPanel extends Panel {
    constructor(parent_widget) {
      super(parent_widget, 'Properties');
    }

    addSubNodesTo(parent_node) {
        let content = document.createElement('div');
        let input = document.createElement('input');
        input.placeholder = 'Placeholder...';
        content.appendChild(input);
        parent_node.appendChild(content);
      }
  }

  class MembersPanel extends Panel {
    constructor(parent_widget) {
      super(parent_widget, 'Members');
      this.filter = null;
      this.onmemberclick = new Signal();
      this.onmemberdblclick = new Signal();
      this.onmemberclick.connect(this.onClickMember.bind(this));
    }

    onClickMember(args){
      let new_mber = args.member;
      if(new_mber == this.selected_member)
        return;
      if(this.selected_member)
        this.selected_member.classList.remove("selected");
      new_mber.classList.add("selected");
      this.selected_member = new_mber;
    }

    addMembers(category, members) {
      if (!this.categorized_members[category])
        this.categorized_members[category] = {collapse: false, members: [], name: ''};
      if (members)
        this.categorized_members[category].members = this.categorized_members[category].members.concat(members);
    }

    fetchMembers() {
      this.categorized_members = {};
      for (const [category, members] of Object.entries(this.getParentWidget().getDataMembers()))
        this.addMembers(category, members);
    }

    addSubNodesTo(parent_node) {
      this.fetchMembers();
      parent_node.classList.add('membersPanel');
      let input = document.createElement('input');
      input.in_panel = this;
      input.placeholder = "Search...";
      input.addEventListener("input",function(){
        this.in_panel.filter = this.value;
        this.in_panel.updateMemberTreeView(this.in_panel.filter, true);
      });
      parent_node.appendChild(input);
      this.members_tree_view = document.createElement('div');
      this.updateMemberTreeView();
      parent_node.appendChild(this.members_tree_view);
    }

    updateMemberTreeView(filter, not_collapse) {
      this.members_tree_view.innerHTML = '';
      for (const [name, category] of Object.entries(this.categorized_members)) {
        //todo hierarchical html elements
        let sub_nodes = this.createNodeForCategory(name, category, filter, not_collapse);
        for (const node of sub_nodes) {
          this.members_tree_view.appendChild(node);
        }
      }
    }

    createNodeForCategory(name, category, filter, not_collapse) {
      let category_node = document.createElement('div');
      category_node.classList.add('categoryName');
      let icon = document.createElement('i');
      icon.style.width = "1rem";
      icon.classList.add("fa");
      if (!category.collapse || not_collapse)
        icon.classList.add("fa-chevron-down");
      else
        icon.classList.add("fa-chevron-right");
      icon.ariaHidden = true;
      let title = document.createElement('p');
      title.innerHTML = name;
      let label = document.createElement('div');
      label.appendChild(icon);
      label.appendChild(title);
      category_node.appendChild(label);
      let add_button = document.createElement('button');
      add_button.classList.add('addbutton');
      add_button.innerHTML = "Add...";
      add_button.in_panel = this;
      add_button.category_name = name;
      add_button.onclick = function(event){
        this.in_panel.getParentWidget().newDataMember(this.category_name);
        this.in_panel.fetchMembers();
        this.in_panel.updateMemberTreeView();
        event.stopPropagation();
      }
      category_node.appendChild(add_button);
      category_node.in_panel = this;
      category_node.in_category = category;
      category_node.onclick = function(){
        this.in_category.collapse = !this.in_category.collapse;
        this.in_panel.updateMemberTreeView(this.in_panel.filter);
      };
      let subnodes = this.attachNodesInCategory(category, category_node, filter, not_collapse);
      subnodes.unshift(category_node);
      return subnodes;
    }

    attachNodesInCategory(category, category_node, filter, not_collapse) {
      let sub_nodes = [];
      if(!category.collapse || not_collapse) {
          for (const member of category.members) {
            let node = this.createOneMemberNode(member, filter);
            if(node)
              sub_nodes.push(node);
          }
      }
      return sub_nodes;
    }

    createOneMemberNode(member, filter){
      let name = member.name;
      if(filter && !name.includes(filter))
        return null;
      let memberEl = document.createElement('p');
      if(!filter){
        let text = document.createTextNode(name);
        memberEl.appendChild(text);
      }
      else{
        let last_index = 0;
        for (const substring of name.matchAll(filter)) {
        let not_matched_span = document.createElement("span");
        if(last_index != substring.index){
          let not_matched_text = document.createTextNode(name.substring(last_index, substring.index));
          not_matched_span.appendChild(not_matched_text);
          memberEl.appendChild(not_matched_span);
        }
        let matched_span = document.createElement("span");
        last_index = substring.index + substring[0].length;
        let matched_text = document.createTextNode(name.substring(substring.index, last_index));
        matched_span.classList.add('matched_text');
        matched_span.appendChild(matched_text);
        memberEl.appendChild(matched_span);
      }
        if(last_index<name.length){
          let not_matched_span = document.createElement("span");
          let not_matched_text = document.createTextNode(name.substring(last_index, name.length));
          not_matched_span.appendChild(not_matched_text);
          memberEl.appendChild(not_matched_span);
        }
      }
      memberEl.classList.add('memberEl');
      memberEl.draggable = true;
      memberEl.in_panel = this;
      memberEl.data = member;
      memberEl.ondblclick = function(){
        this.in_panel.onmemberdblclick.emit({data: this.data});
      };
      memberEl.onclick = function(){
        this.in_panel.onmemberclick.emit({data:this.data, member:this});
      };
      memberEl.ondragstart = function(){

        onDrag(
          {graph: parent.data_graph, type: type, name: group.list[i]}
        )
      }
      return memberEl;
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

  class GraphEditor extends Panel {
    constructor(parent_widget, name) {
      super(parent_widget, name);
       this.onclose = new Signal();
    }

    onCloseRequest(msg) {
      super.onCloseRequest(msg);
      this.onclose.emit({name: this.name});
    }

    addSubNodesTo(parent_node) {
      function createMenu(items,label='', prefix, scene, commands,inactive){
          let m = new Menu({commands:commands});
          for(let i =0; i<items.length; i++){
            //let args = items[i].args || {};
            let args = {}
            args._scene = scene;
            args._content = items[i].args;
            args._active = true;
            if(!items[i].submenu){
              //todo: we are seeting the args of the item itself?
              if(items[i].inactive || inactive){
                args._active=false;
              }
              m.addItem({
                command: prefix+items[i].command,
                args: args
              });
            } else {
              m.addItem({type: 'submenu',
              submenu: createMenu(items[i].submenu.items,
                                items[i].submenu.label,prefix,commands,items[i].inactive)});
            }

          }
          m.title.label = label;
          m.title.mnemonic = 0;
          return m;
        };
      this.scene = new VPE.Scene(parent_node);
      let canvas = this.scene.canvas;
      this.scene.start();
      // canvas.addEventListener('dragenter', function(e){e.preventDefault();})
      // canvas.addEventListener('dragover', function(e){
      //   canvas.dispatchEvent(new MouseEvent("mousemove",e));
      //   e.preventDefault();
      // })
      // canvas.addEventListener("drop",function(event){
      //   let el = graph.draggedElement;
      //   if(el){
      //     if(el.type === "subgraphs"){
      //       let subgraph = el.graph.subgraphs[el.name]
      //       graph.commands.execute("litegraph:CreateNodeCommand", {_scene: graph.scene, _content: [{node_type:"FunctionNode", opts:{function: subgraph}}]});
      //     } else {
      //       //should be a variable
      //
      //       let m = createMenu([
      //         {command: "graph:CreateSetNode", args: el},
      //         {command: "graph:CreateGetNode", args: el},
      //       ],"", "",graph.scene, graph.commands);
      //
      //       m.open(event.clientX,event.clientY);
      //     }
      //   }
      // });
      // function getRegisteredNodes(reg){
      //     let cats = reg.getNodeTypesInAllCategories();
      //     function putInCat(object){
      //
      //       let array = [];
      //       for(const [key,obj] of Object.entries(object)){
      //         if(key == "__is_category")
      //           continue;
      //         if(!obj.__is_category){
      //           array.push({label:key, node_type: (new obj()).type});
      //         } else {
      //           let help = putInCat(obj);
      //           array.push({name:key,value:help});
      //         }
      //       }
      //       return array;
      //     }
      //
      //     return putInCat(cats);
      //   };
      //let gs = getRegisteredNodes(VPE.TypeRegistry);
      //let searchMenu = new SearchMenu(graph, gs);
      // graph.search_menu = searchMenu;
      // graph.commands = new CommandRegistry();

      //decorates the litegraph commands with lumino information
      // function fillCommandRegistry(commands, allCommands){
      //   let helper = getAllContextCommands();
      //   for(let i = 0; i< helper.length; i++){
      //     commands.addCommand(
      //       "litegraph:"+helper[i].name,{
      //         label: helper[i].label,
      //         mnemonic:0,
      //         execute: function(args){
      //           return helper[i].exec(args._scene, args._content);
      //         },
      //       }
      //     )
      //   }
      //
      //   //Set
      //   commands.addCommand("graph:CreateSetNode",
      //     {
      //       label: "Set", mnemonic:0,
      //       execute: function(args){
      //         let new_args = {_scene: args._scene, _content:[{}]};
      //         new_args._content[0].node_type = "SetVariableNode"
      //         new_args._content[0].opts = {};
      //         let opts = new_args._content[0].opts;
      //         opts.variable = args._content;
      //         commands.execute("litegraph:CreateNodeCommand", new_args)
      //       },
      //       isEnabled: function(args){
      //         return args._active;
      //       }
      //     }
      //   );
      //
      //   //Set
      //   commands.addCommand("graph:CreateGetNode",
      //     {
      //       label: "Get", mnemonic:0,
      //       execute: function(args){
      //         let new_args = {_scene: args._scene, _content:[{}]};
      //         new_args._content[0].node_type = "GetVariableNode"
      //         new_args._content[0].opts = {};
      //         let opts = new_args._content[0].opts;
      //         opts.variable = args._content;
      //         commands.execute("litegraph:CreateNodeCommand", new_args)
      //       },
      //       isEnabled: function(args){
      //         return args._active;
      //       }
      //     }
      //   );
      // }
      //fillCommandRegistry(graph.commands, getAllContextCommands());
      // parent_node.addEventListener('contextmenu', function (event) {
      //     let cs = graph.scene.getContextCommands();
      //     searchMenu.close();
      //     if(cs!=null){
      //       let m = createMenu(cs,"", "litegraph:",graph.scene, graph.commands);
      //       m.open(event.clientX,event.clientY);
      //     }
      //      else {
      //       console.log("show default search menu");
      //       searchMenu.open(event.clientX,event.clientY);
      //     }
      //     event.preventDefault();
      //     event.stopPropagation();
      //   });
    }
    onResize(){
      this.scene.fitToParentSize();
    }
  }

  class SearchMenu extends Widget {
  constructor(graph, gs){
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
                node[category] = {label: createLabel(category, s1),node_type:group.node_type};
              }
              else if(addEverything){
                node[category] = {label: category, node_type:group.node_type};
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

      this.addMember = function(category,member){
        console.log(category,member);

        function addMember(node,category,member){
          if(!Object.keys(category).length>0){
            if(node[member.label]){
              console.error("Member"+member+"was already added");
              return;
            } else {
              node[member.label] = member;
            }
          } else {
            if(!node[category[0]]){
              node[category[0]] = {name: category[0], list: {}, show: true};
            }
            addMember(node[category[0]].list, category.slice(1), member);
          }
        }
        addMember(this._groups, category,member);
      }
      let prevObj = null;

      function onclick(obj){
        if(prevObj){
          prevObj.classList.remove("selected");
        }
        prevObj = obj;
        obj.classList.add("selected");
        graph.commands.execute("litegraph:CreateNodeCommand", {_scene: graph.scene, _content: [{node_type: obj.node_type}]});
        graph.search_menu.close();
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
              catItem.onclick = function(){
                groupClick(group);
              };

              that._list.appendChild(catItem);
              if(group.show)
                addNodes(list,group.list,indent+1);
            } else {
              let p = document.createElement('p');
              p.innerHTML = group.label;
              let memberEl = document.createElement('div')
              memberEl.appendChild(d);
              memberEl.appendChild(p);
              memberEl.classList.add('memberEl');
              memberEl.onclick = function(){onclick(memberEl);};
              memberEl.node_type = group.node_type;
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
            that.addMember(category,list[i]);
          } else {
            addToMenu(category.concat([list[i].name]), list[i].value);
          }
        }
      }

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

  function isInBoundingRect(x, y, rect){
    return  x>rect.left && x<rect.right && y > rect.top && y< rect.bottom;
  }

  function EditorFocusTracker(dock_panel){
    this.dock_panel = dock_panel;
    this.focusd_editor = null;
    this.focusd_graph_editor = null;
    let update_focus_widget_callback = this.updateFocusEditors.bind(this);
    this.dock_panel.node.addEventListener('mousedown', update_focus_widget_callback);
  }

  EditorFocusTracker.prototype.updateFocusEditors = function (e){
    let editor = this.getFocusedEditor(e, this.dock_panel);
    if(!editor){
      this.focusd_editor = null;
      this.focusd_graph_editor = null;
    }
    let editor_not_changed = this.focusd_editor == editor;
    if(editor_not_changed){
      let graph_editor = this.getFocusedGraphEditor(e, this.focusd_editor);
      this.focusd_graph_editor = graph_editor || this.focusd_graph_editor;
    } else{
      this.focusd_editor = editor;
      let graph_editor = this.getFocusedGraphEditor(e, this.focusd_editor, true);
      this.focusd_graph_editor = graph_editor;
    }
  }

  EditorFocusTracker.prototype.getFocusedEditor = function (e, dock_panel){
    for (const selected_widget of dock_panel.selectedWidgets()) {
        if(isInBoundingRect(e.clientX, e.clientY, selected_widget.node.getBoundingClientRect()))
          return selected_widget;
    }
    for (const tab_bar of dock_panel.layout.tabBars()) {
         if(isInBoundingRect(e.clientX, e.clientY, tab_bar.node.getBoundingClientRect()))
           return tab_bar.currentTitle.owner;
    }
    return null
  }

  EditorFocusTracker.prototype.getFocusedGraphEditor = function (e, dock_panel, default_if_not_found){
    for (const selected_widget of dock_panel.selectedWidgets()) {
        if(selected_widget instanceof GraphEditor && isInBoundingRect(e.clientX, e.clientY, selected_widget.node.getBoundingClientRect()))
          return selected_widget;
    }
    for (const tab_bar of dock_panel.layout.tabBars()) {
         if(tab_bar.currentTitle.owner instanceof GraphEditor && isInBoundingRect(e.clientX, e.clientY, tab_bar.node.getBoundingClientRect()))
           return tab_bar.currentTitle.owner;
    }
    if(default_if_not_found)
      for (const tab_bar of dock_panel.layout.tabBars()) {
          if(tab_bar.currentTitle.owner instanceof GraphEditor)
            return tab_bar.currentTitle.owner;
      }
    return null
  }

  function createCommands(focus_tracker){
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

    commands.addCommand('members:delete',{
      label: "Delete",
      mnemonic: 0,
      execute: function(){
        console.log('Delete member placeholder');
      }
    });
    commands.addCommand('editor:undo',{
      label: "Undo",
      mnemonic: 0,
      execute: function(){
          //focus_tracker.focusd_graph_editor.scene.undo_history.undo();
      }
    });

    commands.addCommand('editor:redo',{
      label: "Redo",
      mnemonic: 0,
      execute: function(){
        //focus_tracker.focusd_graph_editor.scene.undo_history.redo();
      }
    });
  }
  let editor_panel;

  function examples(){
    let graph = new VPE.Graph('graph');
    graph.addVariable("Aaa","Image", null);
    graph.addOutput("A2aa","Image", null);
    graph.addInput("A4aa","Image", null);
    graph.addVariable("Aaaaffa","Image", null);
    graph.addSubGraph("myGraph", new VPE.Graph("myGraph"));
    addNewEditor(editor_panel, null, graph, 'abstract graph example');

    let class_data = new VPE.Class('class');
    class_data.addVariable("Aaa","Image", null);
    addNewEditor(editor_panel, null, class_data, 'class example');

    let function_library = new VPE.FunctionLibrary('functions');
    function_library.addSubGraph("myGraph", new VPE.Graph("myGraph"));
    addNewEditor(editor_panel, null, function_library, 'functions example');
  }

  function main(){
    let menu_bar = createMenuBar(commands);
    editor_panel = createEditorPanel();
    Widget.attach(menu_bar, document.body);
    Widget.attach(editor_panel, document.body);
    //let focus_tracker = new EditorFocusTracker(editor_panel);
    createCommands(/*focus_tracker*/);
    examples();

    //todo: abstract away in a CreateContextMenu function
    let c = new ContextMenu({commands:commands});
    c.addItem({command:"file:new",selector:".content"});
    c.addItem({command:"file:load",selector:"*"});
    c.addItem({command:"members:delete",selector:".memberEl"});

    document.addEventListener('contextmenu', function (event) {
      if (c.open(event)) {
        event.preventDefault();
      }
    });
  }

  return main;
})