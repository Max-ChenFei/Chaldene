function CheckBox(cbs){
    function BBox(left,top,width,height){
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
    }

    function rgb2str(rgb){
        if(rgb.length===3){
            return "rgb("+rgb[0]+", "+rgb[1]+", "+rgb[2]+")";
        }
        return "rgba("+rgb[0]+", "+rgb[1]+", "+rgb[2]+","+ rgb[3] +")";
    }

    this.ctx = cbs.ctx;

    this.bbox = new BBox(cbs.left,cbs.top,cbs.width,cbs.height);
    this.border_width = cbs.border_width;
    this.roundness = cbs.roundness;
    this.checked = cbs.checked;
    this.background_color = rgb2str(cbs.background_color);
    this.border_color = rgb2str(cbs.border_color);
    this.checked_background_color = rgb2str(cbs.checked_background_color);
    this.checked_border_color = rgb2str(cbs.checked_border_color);
    this.checkmark_color = rgb2str(cbs.checkmark_color);

    this._callbacks = {};
    this._callbacks["toggle"] = {};

    this.toggle = function(){
        this.checked = !this.checked;
        this.runCallbacks("toggle",this.checked);
    }
    this.isInside = function(x,y){
        return x>=0 && y>=0 && x<=this.bbox.width && y<=this.bbox.height;
    }
    
    this.runCallbacks = function(name,arg){
        let callbacks =  Object.entries(this._callbacks[name]);
        for(let i in callbacks){
            callbacks[i][1](arg);
        }
    }

    this.addCallback = function(name,callback){
        this._callbacks[name][callback]=callback;
    }

    this.update = function(delta){

    }

    this.draw = function(){
        let ctx = this.ctx;
        
        ctx.save();
        ctx.translate(this.bbox.left,this.bbox.top);
        ctx.beginPath();
        ctx.moveTo(0,0);
        ctx.lineTo(0,this.bbox.height);
        ctx.lineTo(this.bbox.width,this.bbox.height);
        ctx.lineTo(this.bbox.width,0);
        ctx.lineTo(0,0);
        ctx.fillRect(0,0,this.bbox.width,this.bbox.height);
        ctx.fillStyle=this.checked?this.checked_background_color:this.background_color;
        ctx.strokeStyle=this.checked?this.checked_border_color:this.border_color;
        ctx.lineWidth   = this.border_width;
        ctx.fill();
        ctx.stroke();
        ctx.closePath();

        if(this.checked){
            let base_curve =
                [[this.bbox.width*.1,this.bbox.height*0.6],
                [this.bbox.width*.5,this.bbox.height*.9],
                [this.bbox.width*.9,this.bbox.height*.1]];
            
            let normals = [
                [base_curve[1][1]-base_curve[0][1],base_curve[0][0]-base_curve[1][0]],
                [1,1],
                [base_curve[2][1]-base_curve[1][1],base_curve[1][0]-base_curve[2][0]]
            ]
            for(let i =0; i<3; i++){
                let f = normals[i][0]*normals[i][0] + normals[i][1]*normals[i][1];
                f = 1.0/Math.sqrt(f);
                normals[i][0]*=f;
                normals[i][1]*=f;
            }


            normals[1][0] = normals[0][0]+normals[2][0];
            normals[1][1] = normals[0][1]+normals[2][1];

            for(let i =0; i<3; i++){
                let f = normals[i][0]*normals[i][0] + normals[i][1]*normals[i][1];
                f = 1.0/Math.sqrt(f);
                normals[i][0]*=f;
                normals[i][1]*=f;
            }
            


            ctx.beginPath();
            let cw = 0.1*this.bbox.height;
            ctx.moveTo(base_curve[0][0]+normals[0][0]*cw,base_curve[0][1]+normals[0][1]*cw);
            ctx.lineTo(base_curve[0][0]-normals[0][0]*cw,base_curve[0][1]-normals[0][1]*cw);
            ctx.lineTo(base_curve[1][0]-normals[1][0]*cw,base_curve[1][1]-normals[1][1]*cw);
            ctx.lineTo(base_curve[2][0]-normals[2][0]*cw,base_curve[2][1]-normals[2][1]*cw);
            ctx.lineTo(base_curve[2][0]+normals[2][0]*cw,base_curve[2][1]+normals[2][1]*cw);
            ctx.lineTo(base_curve[1][0]+normals[1][0]*cw,base_curve[1][1]+normals[1][1]*cw);
            ctx.lineTo(base_curve[0][0]+normals[0][0]*cw,base_curve[0][1]+normals[0][1]*cw);
            ctx.fillStyle = this.checkmark_color;
            ctx.fill();
            ctx.closePath();
        }
        ctx.restore();
    }
}

CheckBox.Settings = function(){
    this.ctx=
    this.left = 40;
    this.top = 60;
    this.width =30;
    this.height = 30;
    this.border_width =3;
    this.roundness=0
    this.checked=false;
    this.background_color = [240,240,250];
    this.border_color=[0,0,0];
    this.checked_background_color = [240,0,0];
    this.checked_border_color=[0,0,0,0];
    this.checkmark_color = [0,200,0]
}

CheckBox.shallow_clone = function(o){
    let a={};
    for(let i in o){
        a[i] = o[i];
    }
    return a;
}
