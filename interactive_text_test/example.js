
function App(){
    var that = this;

    var canvas = document.getElementById("mainCanvas");

    function mousemove(e){
        that.textbox.updateMouse(e);
        that.textbox2.updateMouse(e);  
    }

    function mousedown(e){
        that.textbox.mousedown(e);
        that.textbox2.mousedown(e);
    }
    function dblclick(e){
        that.textbox.doubleClick(e);
        that.textbox2.doubleClick(e);
    }

    function copy(text){
        that.clipboard = text;
    }

    function paste(tw){
        if(!that.clipboard)
            return;
        tw.text+=that.clipboard;
    }

    function mouseup(e){
        that.textbox.mouseup();
        that.textbox2.mouseup();
    }
    function onKeyDown(e){
        
        that.textbox.onkeydown(e);
        
        that.textbox2.onkeydown(e);


    }

//example usage
    this.init=function(){
        this.ctx = canvas.getContext("2d");

        let tbs = new TextBox.TextBoxSettings();
        tbs.canvas = canvas;
        tbs.ctx = this.ctx;
        tbs.left = 20;
        tbs.top = 30;
        tbs.width = 400;
        tbs.height = 300;
        tbs.default_font_family = "arial";
        tbs.background_color = [50,50,100,0.3];
        tbs.text_color = [240,240,240,1.0];
        tbs.selection_color = [150,150,200,1.0];
        tbs.default_line_height = 30;
        tbs.default_alignment = "RightAligned";
        tbs.default_text = "Hello World!\nLorem ipsum lorem ipsum lorem ipsum\nShort sentence.\nSingle.\nWord.\nLorem;\nipsum;\nlorem\nipsum\n";
        tbs.rolling_text=false;
        tbs.edit_scroll=true;
        tbs.editable=true;
        tbs.selectable=true;
        tbs.max_lines=0;
        tbs.reset_view_on_unfocus = true;

        

        this.textbox = new TextBox(tbs);

        tbs.left = 20;
        tbs.top = 350;
        tbs.height = 60;
        tbs.default_text ="uuugh";
        tbs.max_lines=1;
        tbs.editable=true;
        tbs.padding_top = 2;
        tbs.padding_bottom = 2;
        tbs.padding_left = 6;
        tbs.padding_right = 6;
        tbs.round_corners = [[0,0],[0,0],[0,0],[0,0]];
        tbs.round_corners[3][0] =  0.5*tbs.height/tbs.width;
        tbs.round_corners[3][1] = 0.5;
        tbs.round_corners[1][0] =  0.5*tbs.height/tbs.width;
        tbs.round_corners[1][1] = 0.5;
        this.textbox2 = new TextBox(tbs);
        
        

        this.textbox2.addCallback("editEnd",
            function(){
            let s = that.textbox2.getText();
            s = s.split(/\s+/)[0];
            s = (Math.round(s)).toString();
            that.textbox2.setText(s);
        });

        this.textbox.addCallback("copyToClipboard",copy);
        this.textbox.addCallback("pasteFromClipboard",paste);
        
        this.textbox2.addCallback("copyToClipboard",copy);
        this.textbox2.addCallback("pasteFromClipboard",paste);

        document.addEventListener("keydown",onKeyDown);
        document.addEventListener("mousedown",mousedown);
        document.addEventListener("mouseup",mouseup);
        document.addEventListener("mousemove",mousemove);
        document.addEventListener("dblclick",dblclick);
    }


    this.loop = function(){
        that.ctx.save();
        that.ctx.fillStyle = "rgb(255,0,255)";
        that.ctx.fillRect(0,0,canvas.width,canvas.height);
        that.ctx.restore();

        let delta = 1./60.;

        that.textbox.update(delta);
        that.textbox.draw(that.ctx);
        
        that.textbox2.update(delta);
        that.textbox2.draw(that.ctx);

        canvas.style.cursor="default";
        if(that.textbox.isMouseInside()||that.textbox2.isMouseInside()){
            
            canvas.style.cursor="text";
        }

        window.requestAnimationFrame(that.loop);
    }


    this.run = function(){
        this.init();
        window.requestAnimationFrame(this.loop);
    }

    return this;
}

var app = new App();

app.run();