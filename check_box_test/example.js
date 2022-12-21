
function App(){
    var that = this;

    var canvas = document.getElementById("mainCanvas");


    function mousedown(e){
        cb = canvas.getBoundingClientRect();
        if(that.checkBox.isInside(
            e.clientX-cb.left-that.checkBox.bbox.left,
            e.clientY-cb.top-that.checkBox.bbox.top
            )
        )
            that.checkBox.toggle();

        
        if(that.checkBox2.isInside(
            e.clientX-cb.left-that.checkBox2.bbox.left,
            e.clientY-cb.top-that.checkBox2.bbox.top
            )
        )
            that.checkBox2.toggle();
    }

//example usage
    this.init=function(){
        this.ctx = canvas.getContext("2d");

        let cbs = new CheckBox.Settings();
        cbs.canvas = canvas;
        cbs.ctx = this.ctx;
        

        this.checkBox = new CheckBox(cbs);

        cbs.left +=60;
        cbs.top+=40;
        this.checkBox2=new CheckBox(cbs);
                
        

        this.checkBox.addCallback("toggle",
            function(state){
                console.log("toggled!")
        });

        document.addEventListener("mousedown",mousedown);
    }


    this.loop = function(){
        that.ctx.save();
        that.ctx.fillStyle = "rgb(255,0,255)";
        that.ctx.fillRect(0,0,canvas.width,canvas.height);

        let delta = 1./60.;

        that.checkBox.update(delta);
        that.checkBox.draw(that.ctx);
        that.checkBox2.update(delta);
        that.checkBox2.draw(that.ctx);

        window.requestAnimationFrame(that.loop);
    }


    this.run = function(){
        this.init();
        window.requestAnimationFrame(this.loop);
    }
}

var app = new App();

app.run();
