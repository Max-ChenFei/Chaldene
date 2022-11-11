var canvas = document.getElementById("mainCanvas");



function TextBox(tbs){

    let ctx = tbs.ctx;

    function max(i1,i2){
        if(i1<i2)
            return i2;
        return i1;
    }

    function min(i1,i2){
        if(i1>=i2)
            return i2;
        return i1;
    }

    function BBox(left,top,width,height){
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
    }

    function Font(){
        this.set_height = function(height){
            this.height = height;
            this.size = (this.height).toString() + "px";
        }
        this.set_family = function(name){
            this.family = name;
        }

        this.set_variant = function(variant){
            this.variant = variant;
        }
        this.set_style = function(style){
            this.style = style;
        }

        this.set_weight = function(weight){
            this.weight = weight;
        }

        this.getFontDeclaration = function(){
            return [this.style,this.variant,this.weight,this.size,this.family].join(" ");
        }

        this.set_height(32);
        this.set_family("serif");
        this.set_weight("normal");
        this.set_variant("normal");
        this.set_style("normal");

    }

    function Caret(){
        this.line=0;
        this.char=0;
        /* return -1 if c is bigger than this, 0 if equal, 1 if lesser */
        this.comp = function(c){
            if(c.line == this.line){
                if(c.char > this.char){
                    return -1;
                } else if(c.char<this.char){
                    return 1;
                } else {
                    return 0;
                }
            }else if(c.line>this.line){
                return -1;
            } else {
                return 1;
            }
        }
    }
    let textbox = this;

    this.mousedown = function(){
        this.useMouseCursor = true;
        if(this.selection.first){
            this.selection.end();
        }
        this.computeMouseCursor();
        this.selection.start();
    }
    this.mouseup = function(){
        this.useMouseCursor = false;
    }

    this.onkeydown = function(e){
        
        if(e.code === "ArrowRight"){
            this.moveCaret(0,e.shiftKey);
        }

        if(e.code === "ArrowLeft"){
            this.moveCaret(1,e.shiftKey);
        }

        if(e.code === "ArrowDown"){
            this.moveCaret(2,e.shiftKey);
        }
        if(e.code === "ArrowUp"){
            this.moveCaret(3,e.shiftKey);
        }
        //todo: check this
        if(e.key.length===1){
            this.putChar(e.key);
        }

        if(e.key === "Insert"){
            this.toggleInsert();
        }

        if(e.key === "Delete"){
            this.delete(true);
        }

        if(e.key === "Backspace"){
            this.delete(false);
        }
        if(e.key === "Enter"){
            this.lineBreak();
        }
    }

    function Line(str,font,formatting="LeftAligned",textwrap="false"){
        this.formatting = formatting;
        this.font = font;

        this.slice = function(a,b){
            let l = new Line();
            l.formatting = this.formatting;
            l.font = this.font;
            l.chars = this.chars.slice(a,b);
            if(b===0 || b)
                l.cumWidths = this.cumWidths.slice(a,b+1);
            else
                l.cumWidths = this.cumWidths.slice(a);

            for(let i = 0; i<l.cumWidths.length; i++){
                l.cumWidths[i] -= this.cumWidths[a];
            }

            l.rawText = this.rawText.slice(a,b);
            
            return l;
        }
        this.append = function(line){
            let a = new Line();
            a.formatting = this.formatting;
            a.font = this.font;

            a.chars = this.chars.concat(line.chars);
            a.cumWidths = this.cumWidths.slice(0,-1).concat(line.cumWidths);

            for(let i = this.chars.length; i<a.cumWidths.length; i++){
                a.cumWidths[i] += this.cumWidths[this.chars.length];
            }
            a.rawText = this.rawText.concat(line.rawText);


            return a;
        }

        if(!str || str === ""){
            this.chars = [];
            this.cumWidths = [0];
            this.rawText = "";
        } else {
            this.cumWidths = [0];
            this.chars = [];
            //todo: allow for different fonts and styles in a single line
            for(let i = 0; i<str.length; i++){
                //todo: separate chars from graphemes
                let c = textbox.cache.getChar(str[i],this.font);
                this.chars.push(c);
                this.cumWidths.push(c.metric.width+this.cumWidths[this.cumWidths.length-1]);
            }
            this.rawText = str;
        }

        this.getText = function(){
            return this.rawText;
        }

        this.draw = function(ctx,i){
            if(this.formatting === "LeftAligned"){
                ctx.fillText(this.getText(),textbox.offset.x,this.font.height*(i+1)+textbox.offset.y);
            } else if(this.formatting === "RightAligned") {
                ctx.fillText(this.getText(),textbox.offset.x+textbox.bbox.width-this.cumWidths[this.cumWidths.length-1],this.font.height*(i+1)+textbox.offset.y);
            } else if(this.formatting === "Centered"){
                ctx.fillText(this.getText(),((2*(textbox.offset.x)+textbox.bbox.width)-this.cumWidths[this.cumWidths.length-1])*0.5,this.font.height*(i+1)+textbox.offset.y);
            }
        }

        this.getCharBegin = function(i){
            if(this.formatting === "LeftAligned"){
                return this.cumWidths[i];
            } else if(this.formatting === "RightAligned") {
                return this.cumWidths[i] +textbox.bbox.width-this.cumWidths[this.cumWidths.length-1];
            } else if(this.formatting === "Centered"){
                return this.cumWidths[i]+ ((textbox.bbox.width)-this.cumWidths[this.cumWidths.length-1])*0.5;
            }
        }

        this.getCharCenter = function(i){
            return (this.getCharBegin(i+1)+this.getCharBegin(i)) * 0.5;
        }

    }

    function CharCache(ctx){
        function Char(c,font){
            this.text = c;
            ctx.save();
            ctx.font = font.getFontDeclaration();
            this.metric = ctx.measureText(c);
            ctx.restore();
        }
        this.cache = {};

        this.getChar = function(c,font){
            if(!this.cache[font]){
                this.cache[font] = {};
            }
            if(!this.cache[font][c]){
                this.cache[font][c] = new Char(c,font);
            }
            return this.cache[font][c];
        }
    }

    function rgb2str(rgb){
        return "rgb("+rgb[0]+", "+rgb[1]+", "+rgb[2]+")";
    }

    let that = this;
    this.selection = {
        min: null,
        max: null,
        first: null,
        start: function(){
            if(this.first){
                return;
            }

            this.min   = new Caret();
            this.max   = new Caret();
            this.first = new Caret();

            this.min.char   = that.caret.char;
            this.min.line   = that.caret.line;
            this.max.char   = that.caret.char;
            this.max.line   = that.caret.line;
            this.first.char = that.caret.char;
            this.first.line = that.caret.line;
        },


        end: function(){
            this.min = null;
            this.max = null;
            this.first = null;
        },

        update: function(){
            if(!this.first){
                return;
            }
            if(this.first.comp(that.caret)<0){
                this.min.char = this.first.char;
                this.min.line = this.first.line;
                this.max.char = that.caret.char;
                this.max.line = that.caret.line;
            } else {
                this.max.char = this.first.char;
                this.max.line = this.first.line;
                this.min.char = that.caret.char;
                this.min.line = that.caret.line;
            }

            if(this.none()){
                this.end();
            }
        },

        none: function(){
            return (!this.min || !this.max ||
                    (this.min.line === this.max.line &&
                        this.min.char === this.max.char)
            );
        }
    }


    this.cache = new CharCache(ctx);
    this.caret = new Caret();
    this.caret.line = 2;
    this.caret.char = 9;
    this.insert = false;
    this.mouse = {x:0,y:0};
    this._inputCallbacks ={};

    
    this.editable = tbs.editable;
    this.selectable = tbs.selectable;
    this.reset_view_on_unfocus=tbs.reset_view_on_unfocus;
    this.background_color = rgb2str(tbs.background_color);
    this.text_color =  rgb2str(tbs.text_color);
    this.selection_color = rgb2str(tbs.selection_color);
    
    this.bbox = new BBox(tbs.left,tbs.top,tbs.width,tbs.height);
    this.offset = {x: 0, y:0};
    this.default_font = new Font();
    this.default_font.set_family(tbs.default_font_family);
    this.default_font.set_height(tbs.default_line_height);
    this.default_alignment = tbs.default_alignment;

    
    this.rolling_text = tbs.rolling_text;
    this.edit_scroll = tbs.edit_scroll;

    this.max_lines = tbs.max_lines;

    let rawText = tbs.default_text;

    this.lineUpdate =function(i){
        this.lines[i].update();
    }


    
    this.getLine = function(i){
        return this.lines[i].getText();
    }
    
    this.setLine = function(str,i){
        let font = this.default_font;
        let alignment = this.default_alignment;
        if(this.lines[i]){
            font = this.lines[i].font;
            alignment = this.lines[i].alignment;
        }
        this.lines[i] = new Line(str,font,alignment);
    }

    this.setText =function(text){        
        let lines = text.split("\n");
        this.lines = [];
        for(let i = 0; i<lines.length; i++){
            this.lines.push(new Line(lines[i],this.default_font,this.default_alignment));
        }
    }

    this.getText = function(){
        if(this.lines.length<=0)
            return "";
        let ret = this.lines[0].getText();
        for(let i = 1; i<this.lines.length; i++){
            ret+= "\n"+this.lines[i].getText();
        }
        return ret;
    }

    this.getTextInterval = function(first,last){
        //todo: validate input args?
        let last_line = this.lines[last.line].slice(0,last.char);
        if(first.line === last.line){
            return last.line.slice(first.char).getText();
        }
        let first_line = this.lines[first.line].slice(first.char);
        let ret=first_line.getText();
        for(let i = first.line+1;i<last.line; i++){
            ret+="\n"+this.lines[i].getText();
        }
        ret+="\n"+last_line.getText();
    }

    this.toggleInsert = function(){
        this.insert = !this.insert;
    }
    
    this.setText(rawText);

    this.putChar = function(char){
        if(!this.selection.none()){
            this.delete();
            this.selection.end();
        }
        let line = this.lines[this.caret.line];
        if(line.chars.length<=this.caret.char){
            line = line.append(new Line(char,line.font))
            this.caret.char = line.chars.length;
        } else if(this.insert){
            line = line.slice(0,this.caret.char)
            .append(new Line(char,line.font))
            .append(line.slice(this.caret.char+1));
            this.caret.char+=1;
        } else {
            line = line.slice(0,this.caret.char)
            .append(new Line(char,line.font))
            .append(line.slice(this.caret.char));
            this.caret.char+=1;
        }
        this.lines[this.caret.line]=line;
    }
    this.delete = function(forward){
        if(!this.selection.none()){
            this.caret.char = this.selection.min.char;
            this.caret.line = this.selection.min.line;

            let maxLine = this.lines[this.selection.max.line].slice(this.selection.max.char);
            let minLine = this.lines[this.selection.min.line].slice(0,this.selection.min.char);


            let new_line = minLine.append(maxLine);

            this.lines = this.lines.slice(0,this.selection.min.line)
                        .concat([new_line])
                        .concat(this.lines.slice(this.selection.max.line+1));

            this.selection.end();
            return;
        }
        let line = this.lines[this.caret.line];
        if(forward){
            if(line.chars.length<=this.caret.char){
                if(this.caret.line>= this.lines.length-1){
                    //do nothing
                } else {
                    let new_line = line.append(this.lines[this.caret.line+1])
                    this.lines = this.lines.slice(0,this.caret.line+1).concat(this.lines.slice(this.caret.line+2));
                    this.lines[this.caret.line] = new_line;
                }
            } else {
                line = line.slice(0,this.caret.char).append(line.slice(this.caret.char+1));
                this.lines[this.caret.line] = line;
            }
        } else {
            if(this.caret.char == 0){
                if(this.caret.line == 0){
                    //do nothing
                } else {
                    let new_line = this.lines[this.caret.line-1].append(line);
                    this.lines = this.lines.slice(0,this.caret.line).concat(this.lines.slice(this.caret.line+1));
                    this.caret.line -=1;
                    this.caret.char = this.lines[this.caret.line].chars.length;
                    this.lines[this.caret.line] = new_line;
                }
            } else {
                line = line.slice(0,this.caret.char-1).append(line.slice(this.caret.char));
                this.lines[this.caret.line] = line;
                this.caret.char -=1;
            }
        }
    }

    this.lineBreak = function(){
        if(this.max_lines===1){
            this.noEdit();
        }
        if(this.max_lines>0 && this.lines.length>=this.max_lines)
            return;

        let new_line = this.lines[this.caret.line].slice(this.caret.char);
        this.lines[this.caret.line] = this.lines[this.caret.line].slice(0,this.caret.char);
        this.lines = this.lines.slice(0,this.caret.line+1).concat([new_line]).concat(this.lines.slice(this.caret.line+1));
        this.caret.char = 0;
        this.caret.line +=1;
    }

    this.computeMouseCursor = function(){
        let localCoords = {
            x:this.mouse.x - this.offset.x,
            y:this.mouse.y - this.offset.y,
        }
        this.caret.line = Math.floor(localCoords.y/this.default_font.height);
        if(this.caret.line<0){
            this.caret.line = 0;
            this.caret.char = 0;
            return;
        }
        if(this.caret.line>=this.lines.length){
            this.caret.line = this.lines.length-1;
            this.caret.char = this.lines[this.caret.line].chars.length;
            return;
        }

        //todo: binary search
        let line = this.lines[this.caret.line]
        this.caret.char = 0;
        for(let i = 0; i<line.chars.length; i++){
            
            if(line.getCharCenter(i) >localCoords.x){
                break;
            }
            this.caret.char = i+1;
        }        
    }

    this.moveCaret = function(direction, select = false){
        if(this.useMouseCursor){
            return;
        }
        if(select){
            this.selection.start();
        }
        if(select || this.selection.none()){
            switch(direction){
                case 0: //right
                    if(this.caret.char+1>this.lines[this.caret.line].chars.length){
                        if(this.lines[this.caret.line+1]){
                            this.caret.char = 0;
                            this.caret.line +=1;
                        }
                    } else {
                        this.caret.char+= 1;
                    }
                    break;
                case 1: //left
                    if(this.caret.char-1 < 0){
                        if(this.caret.line>0){
                            this.caret.char = this.lines[this.caret.line-1].chars.length;
                            this.caret.line -=1;
                        }
                    } else {
                        this.caret.char -=1;
                    }
                    break;
                case 2: //down
                    if(this.caret.line<this.lines.length-1){
                        this.caret.line+=1;
                        //todo: go to closest character instead
                        this.caret.char =
                            min(this.caret.char,
                            this.lines[this.caret.line].chars.length);

                    }
                    break;
                case 3: //up
                    if(this.caret.line>0){
                        this.caret.line-=1;
                        //todo: go to closest character instead
                        this.caret.char =
                            min(this.caret.char,
                            this.lines[this.caret.line].chars.length);

                    }
                    break;
            }
        } else {
            switch(direction){
                case 0:
                case 2:
                    this.caret.line = this.selection.max.line;
                    this.caret.char = this.selection.max.char;
                    break;
                case 1:
                case 3:
                    this.caret.line = this.selection.min.line;
                    this.caret.char = this.selection.min.char;
                    break;
            }
        }

        if(select){
            this.selection.update();
        }
        if(!select){
            this.selection.end();
        }

    }

    this.edit = function(){
        if(!this.editable)
            return
        this.editing = true;
    }

    this.noEdit = function(){
        if(this.editing){
            this.editing = false;
            this.runInputCallbacks();
        }
        
        this.selection.end();
    }

    this.runInputCallbacks = function(){
        let callbacks =  Object.entries(this._inputCallbacks);
        for(let i in callbacks){
            callbacks[i][1]();
        }
    }

    this.addInputCallback = function(callback){
        this._inputCallbacks[callback]=callback;
    }

    this.update = function(delta){
        if(!this.time){
            this.time = 0;
        }
        this.time+=delta;


        this.maxWidth = this.bbox.width;
        this.minWidth = 0;
        for(let i = 0; i<this.lines.length; i++){

            let x1 = this.lines[i].getCharBegin(this.lines[i].chars.length);
            let x0 = this.lines[i].getCharBegin(0);
            this.maxWidth = max(x1,this.maxWidth);
            this.minWidth = min(x0,this.minWidth);
        }

        if(!this.editing && this.rolling_text){
            if(this.maxWidth-this.minWidth>this.bbox.width){
                let help = this.time*0.3;
                let even = (Math.floor(help/Math.PI)%2);
                if(even==0){
                    even = -1;
                }
                let scroll = -(even*Math.cos(help)*0.5-0.5);

                this.offset.x = -scroll*this.minWidth + (-1+scroll)*(this.maxWidth-this.bbox.width);
            } else {
                this.offset.x = 0;
            }
        }
        
        if((this.editing || !this.selection.none()) && this.edit_scroll){
            let x = this.lines[this.caret.line].getCharBegin(this.caret.char);
            if(x<0-this.offset.x){
                this.offset.x = -x;
            }
            if(x>this.bbox.width-this.offset.x){
                this.offset.x = this.bbox.width-x;
            }

            let y0 = this.caret.line*this.default_font.height;
            let y1 = y0+this.default_font.height;

            if(y0<0-this.offset.y){
                this.offset.y = -y0;
            }
            if(y1>this.bbox.height-this.offset.y){
                this.offset.y = this.bbox.height-y1;
            }
        }
        if(this.selection.none() && !this.editing && !this.rolling_text &&this.reset_view_on_unfocus ){
            this.offset.x =0;
            this.offset.y =0;
        }

        if(this.useMouseCursor){            
            this.selection.start();
            this.computeMouseCursor();
            this.selection.update();
        }

    }

    this.draw = function(ctx){
        ctx.save();
        ctx.translate(this.bbox.left,this.bbox.top);
        ctx.fillStyle = this.background_color;
        ctx.fillRect(0,0,this.bbox.width,this.bbox.height);
        //ctx.fill()


        ctx.beginPath();
        ctx.rect(0,0,this.bbox.width,this.bbox.height);
        ctx.closePath();
        ctx.clip();

        let font = this.default_font;
        if(!this.selection.none() &&(this.selectable || this.editing)){
            ctx.fillStyle = this.selection_color;
            for(let i = this.selection.min.line; i<=this.selection.max.line; i++){
                let rectMinX = this.lines[i].getCharBegin(0);
                let cw = this.lines[i].cumWidths;
                let rectWidth = cw[cw.length-1];
                if(this.selection.min.line == i){
                    rectMinX += cw[this.selection.min.char];
                    rectWidth -= cw[this.selection.min.char];
                }


                if(this.selection.max.line == i){
                    rectWidth = cw[this.selection.max.char]-rectMinX+this.lines[i].getCharBegin(0);
                }

                let rectMinY = i*font.height+font.height*0.2;
                let height = this.lines[i].font.height;

                ctx.fillRect(rectMinX+this.offset.x,rectMinY+this.offset.y,rectWidth,height);
            }
        }


        ctx.fillStyle = this.text_color;
        ctx.font = font.getFontDeclaration();
        //console.log(ctx.font);
        for(let i = 0; i<this.lines.length; i++){
            this.lines[i].draw(ctx,i);
        }
        
        if(this.editing){

        let current_line = this.lines[this.caret.line];

        let factor = Math.abs(Math.cos(this.time*2))
        //factor = factor*factor;
        ctx.globalAlpha = factor;

        if(!this.insert){
            ctx.fillRect(
                current_line.getCharBegin(this.caret.char) + this.offset.x,
                this.offset.y+ this.caret.line*font.height+font.height*0.2,
                2,
                font.height);
        } else {
            let current_width = font.height;
            let line = this.lines[this.caret.line]
            if(this.caret.char<line.chars.length){
                current_width = current_line.getCharBegin(this.caret.char+1)-current_line.getCharBegin(this.caret.char);
            }
            ctx.fillRect(
                current_line.getCharBegin(this.caret.char) + this.offset.x,
                this.offset.y+this.caret.line*font.height+font.height,
                current_width,
                2);
        }
        }
        //ctx.fillRect(this.bbox.left,this.bbox.top,10,10);
        ctx.restore();

    }
}

TextBox.TextBoxSettings = function(){
    this.canvas = null;
    this.ctx = null;
    this.left = 0;
    this.top = 0;
    this.width = 200;
    this.height = 50;
    this.default_font_family = "serif";
    this.background_color = [0,0,0];
    this.text_color = [255,255,255];
    this.selection_color = [0,0,250];
    this.default_line_height = 10;
    this.default_alignment = "LeftAligned";
    this.default_text = "";
    this.rolling_text=true;
    this.edit_scroll=true;
    this.editable=false;
    this.selectable=true;
    this.reset_view_on_unfocus=true;
    this.max_lines = 0;  /* Maximum number of lines. 0 means infinite. */
}

TextBox.shallow_clone = function(o){
    let a={};
    for(let i in o){
        a[i] = o[i];
    }
    return a;
}


function App(){
    var that = this;

    function mousemove(e){
        that.textbox.mouse.x = e.clientX - that.textbox.bbox.left - canvas.getBoundingClientRect().x;
        that.textbox.mouse.y = e.clientY - that.textbox.bbox.top  - canvas.getBoundingClientRect().y;
    
        that.textbox2.mouse.x = e.clientX - that.textbox2.bbox.left - canvas.getBoundingClientRect().x;
        that.textbox2.mouse.y = e.clientY - that.textbox2.bbox.top  - canvas.getBoundingClientRect().y;
    
    }

    function mousedown(e){
        let cb = canvas.getBoundingClientRect();
        if(e.clientX  > cb.x + that.textbox.bbox.left && 
            e.clientX < cb.x + that.textbox.bbox.left+that.textbox.bbox.width &&
            e.clientY > cb.y + that.textbox.bbox.top && 
            e.clientY < cb.y + that.textbox.bbox.top+that.textbox.bbox.height
        )
        {
            that.textbox.edit();
            that.textbox.mousedown();
        } else {
            that.textbox.noEdit();
        }

        if(e.clientX  > cb.x + that.textbox2.bbox.left && 
            e.clientX < cb.x + that.textbox2.bbox.left+that.textbox2.bbox.width &&
            e.clientY > cb.y + that.textbox2.bbox.top && 
            e.clientY < cb.y + that.textbox2.bbox.top+that.textbox2.bbox.height
        )
        {
            that.textbox2.edit();
            that.textbox2.mousedown();
        } else {
            that.textbox2.noEdit();
        }
    }

    function mouseup(e){
        if(that.textbox.editing || that.textbox.selectable)
            that.textbox.mouseup();

        if(that.textbox2.editing || that.textbox2.selectable)
            that.textbox2.mouseup();
    }
    function onKeyDown(e){
        
        if(that.textbox.editing)
            that.textbox.onkeydown(e);
        
        if(that.textbox2.editing)
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
        tbs.background_color = [50,50,100];
        tbs.text_color = [200,200,200];
        tbs.selection_color = [150,150,200];
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
        tbs = TextBox.shallow_clone(tbs);

        tbs.left = 20;
        tbs.top = 350;
        tbs.height = 60;
        tbs.default_text ="uuugh";
        tbs.max_lines=1;
        this.textbox2 = new TextBox(tbs);
        
        

        this.textbox2.addInputCallback(function(){
            let s = that.textbox2.getText();
            s = s.split(/\s+/)[0];
            s = (Math.round(s)).toString();
            that.textbox2.setText(s);
        });

        document.addEventListener("keydown",onKeyDown);
        document.addEventListener("mousedown",mousedown);
        document.addEventListener("mouseup",mouseup);
        document.addEventListener("mousemove",mousemove);
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
