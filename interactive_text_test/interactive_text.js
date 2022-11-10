var canvas = document.getElementById("mainCanvas");



function TextBox(ctx){

    

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

    function InnerText(str){
        this.lines = [];
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
                ctx.fillText(this.getText(),textbox.bbox.left,textbox.bbox.top+this.font.height*(i+1));
            } else if(this.formatting === "RightAligned") {
                ctx.fillText(this.getText(),textbox.bbox.left+textbox.bbox.width-this.cumWidths[this.cumWidths.length-1],textbox.bbox.top+this.font.height*(i+1));
            } else if(this.formatting === "Centered"){
                ctx.fillText(this.getText(),((2*textbox.bbox.left+textbox.bbox.width)-this.cumWidths[this.cumWidths.length-1])*0.5,textbox.bbox.top+this.font.height*(i+1));
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

    this.editable = true;

    this.cache = new CharCache(ctx);
    this.caret = new Caret();
    this.caret.line = 2;
    this.caret.char = 9;
    this.insert = false;
    this.mouse = {x:0,y:0};

    this.backgroundColor = "rgb(30,170,20)";
    this.textColor = "rgb(230,230,230)";

    this.bbox = new BBox(40,50,370,180);
    this.default_font = new Font();

    let rawText = "Hello World!\nThis is just sample text!\nI want to see a very long line here so it goes over the bounds!\nAnd then\nsome\nshort\nones!";

    this.lineUpdate =function(i){
        this.lines[i].update();
    }

    let lines = rawText.split("\n");
    this.lines = [];
    for(let i = 0; i<lines.length; i++){
        this.lines.push(new Line(lines[i],this.default_font,"RightAligned"));
    }

    this.toggleInsert = function(){
        this.insert = !this.insert;
    }

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
        let new_line = this.lines[this.caret.line].slice(this.caret.char);
        this.lines[this.caret.line] = this.lines[this.caret.line].slice(0,this.caret.char);
        this.lines = this.lines.slice(0,this.caret.line+1).concat([new_line]).concat(this.lines.slice(this.caret.line+1));
        this.caret.char = 0;
        this.caret.line +=1;
    }

    this.computeMouseCursor = function(){
        let localCoords = {
            x:this.mouse.x - this.bbox.left,
            y:this.mouse.y - this.bbox.top,
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
        this.editing = false;
    }

    this.update = function(delta){
        if(!this.time){
            this.time = 0;
        }
        this.time+=delta;
        
        if(this.useMouseCursor){            
            this.selection.start();
            this.computeMouseCursor();
            this.selection.update();
        }

    }

    this.draw = function(ctx){
        ctx.save();
        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(this.bbox.left,this.bbox.top,this.bbox.width,this.bbox.height);
        //ctx.fill()


        ctx.beginPath();
        ctx.rect(this.bbox.left,this.bbox.top,this.bbox.width,this.bbox.height);
        ctx.closePath();
        ctx.clip();

        let font = this.default_font;
        if(!this.selection.none() && this.editing){
            ctx.fillStyle = "rgb(150,150,250)";
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

                let rectMinY = this.bbox.top+ i*font.height+font.height*0.2;
                let height = this.lines[i].font.height;

                ctx.fillRect(rectMinX+this.bbox.left,rectMinY,rectWidth,height);
            }
        }


        ctx.fillStyle = this.textColor;
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
                this.bbox.left+current_line.getCharBegin(this.caret.char),
                this.bbox.top+ this.caret.line*font.height+font.height*0.2,
                2,
                font.height);
        } else {
            let current_width = font.height;
            let line = this.lines[this.caret.line]
            if(this.caret.char<line.chars.length){
                current_width = current_line.getCharBegin(this.caret.char+1)-current_line.getCharBegin(this.caret.char);
            }
            ctx.fillRect(
                this.bbox.left+current_line.getCharBegin(this.caret.char),
                this.bbox.top+ this.caret.line*font.height+font.height,
                current_width,
                2);
        }
        }
        //ctx.fillRect(this.bbox.left,this.bbox.top,10,10);
        ctx.restore();

    }
}

TextBox.TextBoxSettings = function(){
    this.ctx = null;
    this.canvas = null;
    this.font_family = "Serif";
    this.height = 12;
    this.formatting = "LeftAlign";
    this.backgroundColor = "rgb(255,0,255)";
    this.textColor = "rgb(255,255,255)";
    this.selectColor = "rgb(25,25,255)";
    this.editable = true;
    this.autoscrollInEdit = {x: true, y:true};
    this.rollingText = "horizontal";
}


function App(){
    var that = this;
    function mousemove(e){
        that.textbox.mouse.x = e.clientX - canvas.getBoundingClientRect().x;
        that.textbox.mouse.y = e.clientY - canvas.getBoundingClientRect().y;
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
    }

    function mouseup(e){
        if(that.textbox.editing)
            that.textbox.mouseup();
    }
    function onKeyDown(e){
        
        if(that.textbox.editing)
            that.textbox.onkeydown(e);


    }

//example usage
    this.init=function(){
        this.ctx = canvas.getContext("2d");
        this.textbox = new TextBox(this.ctx);
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
