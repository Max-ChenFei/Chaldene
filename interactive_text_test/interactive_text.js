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
    }
    let textBox = this;

    function Line(str){
        this.slice = function(a,b){
            let l = new Line();
            l.chars = this.chars.slice(a,b);
            if(b!==undefined)
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
                let c = textBox.cache.getChar(str[i],textBox.default_font);
                this.chars.push(c);
                this.cumWidths.push(c.metric.width+this.cumWidths[this.cumWidths.length-1]);
            }
            this.rawText = str;
        }

        this.getText = function(){
            return this.rawText;
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

    this.cache = new CharCache(ctx);
    this.caret = new Caret();
    this.caret.line = 2;
    this.caret.char = 9;
    this.insert = false;
    this.font_family = "Times New Roman"

    this.backgroundColor = "rgb(30,170,20)";
    this.textColor = "rgb(230,230,230)";

    this.bbox = new BBox(40,50,370,180);
    this.default_font = new Font();

    let rawText = "Hello World!\nThis is just sample text!\nI want to se a very long line here so it goes over the bounds!\nAnd then\nsome\nshort\nones!";

    this.lineUpdate =function(i){
        this.lines[i].update();
    }

    let lines = rawText.split("\n");
    this.lines = [];
    for(let i = 0; i<lines.length; i++){
        this.lines.push(new Line(lines[i]));
    }

    this.toggleInsert = function(){
        this.insert = !this.insert;
    }

    this.putChar = function(char){
        let line = this.lines[this.caret.line];
        if(line.chars.length<=this.caret.char){
            line = line.append(new Line(char))
            this.caret.char = line.chars.length;
        } else if(this.insert){
            line = line.slice(0,this.caret.char)
            .append(new Line(char))
            .append(line.slice(this.caret.char+1));
            this.caret.char+=1;
        } else {
            line = line.slice(0,this.caret.char)
            .append(new Line(char))
            .append(line.slice(this.caret.char));
            this.caret.char+=1;
        }
        this.lines[this.caret.line]=line;
        console.log(this.lines[this.caret.line].chars.length);
        console.log(this.lines[this.caret.line]);
    }
    this.deleteChar = function(forward){
        console.log(forward,"delete")
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
    this.moveCaret = function(direction){
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

        ctx.fillStyle = this.textColor;
        let font = this.default_font;
        ctx.font = font.getFontDeclaration();
        //console.log(ctx.font);

        for(let i = 0; i<this.lines.length; i++){
            //draw line all at once. Can be used if line has single style
            ctx.fillText(this.lines[i].getText(),this.bbox.left,this.bbox.top+font.height*(i+1));
        }
        //console.log(this.lines);
        //console.log(ctx.measureText("i"), ctx.measureText("H"), ctx.measureText("Hi"),ctx.measureText(","));
        let current_line = this.lines[this.caret.line];
        if(!this.insert){
            ctx.fillRect(
                this.bbox.left + current_line.cumWidths[this.caret.char],
                this.bbox.top+ this.caret.line*font.height+font.height*0.2,
                1,
                font.height);
        } else {
            let current_width = font.height;
            let line = this.lines[this.caret.line]
            if(this.caret.char<line.chars.length){
                current_width = line.cumWidths[this.caret.char+1]-line.cumWidths[this.caret.char];
            }
            ctx.fillRect(
                this.bbox.left + current_line.cumWidths[this.caret.char],
                this.bbox.top+ this.caret.line*font.height+font.height,
                current_width,
                2);
        }

        //ctx.fillRect(this.bbox.left,this.bbox.top,10,10);
        ctx.restore();

    }
}






function App(){
    var that = this;
    function onKeyDown(e){
        console.log(e);

        if(e.code === "ArrowRight"){
            that.textbox.moveCaret(0);
        }

        if(e.code === "ArrowLeft"){
            that.textbox.moveCaret(1);
        }

        if(e.code === "ArrowDown"){
            that.textbox.moveCaret(2);
        }
        if(e.code === "ArrowUp"){
            that.textbox.moveCaret(3);
        }
        //todo: check this
        if(e.key.length===1){
            that.textbox.putChar(e.key);
        }

        if(e.key === "Insert"){
            that.textbox.toggleInsert();
        }

        if(e.key === "Delete"){
            that.textbox.deleteChar(true);
        }

        if(e.key === "Backspace"){
            that.textbox.deleteChar(false);
        }
        if(e.key === "Enter"){
            that.textbox.lineBreak();
        }

        console.log(that.textbox.lines[that.textbox.caret.line]);
    }

//example usage
    this.init=function(){
        this.ctx = canvas.getContext("2d");
        this.textbox = new TextBox(this.ctx);
        document.addEventListener("keydown",onKeyDown);
    }


    this.loop = function(){
        that.ctx.save();
        that.ctx.fillStyle = "rgb(255,0,255)"
        //that.ctx.rect(0,0,  20,20);
        that.ctx.fillRect(0,0,canvas.width,canvas.height);
        that.ctx.restore();

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
