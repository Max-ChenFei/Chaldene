// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
/**
 *
 *
 * @module imageprocessingcell
 * @namespace imageprocessingcell
 * @class ImageProcessingCell
 */


define([
    'jquery',
    'components/litegraph/litegraph.js',
    'base/js/namespace',
    'base/js/utils',
    'base/js/i18n',
    'base/js/keyboard',
    'services/config',
    'notebook/js/cell',
    'notebook/js/outputarea',
    'notebook/js/completer',
    'notebook/js/celltoolbar',
    'codemirror/lib/codemirror',
    'codemirror/mode/python/python',
    'notebook/js/codemirror-ipython'
], function(
    $,
    lg,
    IPython,
    utils,
    i18n,
    keyboard,
    configmod,
    cell,
    outputarea,
    completer,
    celltoolbar,
    CodeMirror,
    cmpython,
    cmip
    ) {
    "use strict";
    
    var Cell = cell.Cell;

    /* local util for codemirror */
    var posEq = function(a, b) {return a.line === b.line && a.ch === b.ch;};

    /**
     *
     * function to delete until previous non blanking space character
     * or first multiple of 4 tabstop.
     * @private
     */
    CodeMirror.commands.delSpaceToPrevTabStop = function(cm){
        var tabSize = cm.getOption('tabSize');
        var ranges = cm.listSelections(); // handle multicursor
        for (var i = ranges.length - 1; i >= 0; i--) { // iterate reverse so any deletions don't overlap
            var head = ranges[i].head;
            var anchor = ranges[i].anchor;
            var sel = !posEq(head, anchor);
            if (sel) {
                // range is selection
                cm.replaceRange("", anchor, head);
            } else {
                // range is cursor
                var line = cm.getLine(head.line).substring(0, head.ch);
                if (line.match(/^\ +$/) !== null){
                    // delete tabs
                    var prevTabStop = (Math.ceil(head.ch/tabSize)-1)*tabSize;
                    var from = CodeMirror.Pos(head.line, prevTabStop)
                    cm.replaceRange("", from, head);
                } else {
                    // delete normally
                    var from = cm.findPosH(head, -1,  'char', false);
                    cm.replaceRange("", from, head);
                }
            }
        }
    };

    var keycodes = keyboard.keycodes;

    var ImageProcessingCell = function (kernel, options) {
        /**
         * Constructor
         *
         * A Cell conceived to write code.
         *
         * Parameters:
         *  kernel: Kernel instance
         *      The kernel doesn't have to be set at creation time, in that case
         *      it will be null and set_kernel has to be called later.
         *  options: dictionary
         *      Dictionary of keyword arguments.
         *          events: $(Events) instance 
         *          config: dictionary
         *          keyboard_manager: KeyboardManager instance 
         *          notebook: Notebook instance
         *          tooltip: Tooltip instance
         */
        this.kernel = kernel || null;
        this.notebook = options.notebook;
        this.collapsed = false;
        this.events = options.events;
        this.tooltip = options.tooltip;
        this.config = options.config;
        this.class_config = new configmod.ConfigWithDefaults(this.config,
                                        ImageProcessingCell.options_default, 'ImageProcessingCell');

        // create all attributed in constructor function
        // even if null for V8 VM optimisation
        this.input_prompt_number = null;
        this.celltoolbar = null;
        this.output_area = null;

        this.last_msg_id = null;
        this.completer = null;

        this.scene = null;
        this.canvas = null;

        Cell.apply(this,[{
            config: options.config, 
            keyboard_manager: options.keyboard_manager, 
            events: this.events}]);

        // Attributes we want to override in this subclass.
        this.cell_type = "imageprocessingcell";
        var that  = this;
        this.element.focusout(
            function() { that.auto_highlight(); }
        );

    };

    ImageProcessingCell.options_default = {
        cm_config : {
            extraKeys: {
                "Backspace" : "delSpaceToPrevTabStop",
            },
            mode: 'text',
            theme: 'ipython',
            matchBrackets: true,
            autoCloseBrackets: true
        },
        highlight_modes : {
            'magic_javascript'    :{'reg':['^%%javascript']},
            'magic_perl'          :{'reg':['^%%perl']},
            'magic_ruby'          :{'reg':['^%%ruby']},
            'magic_python'        :{'reg':['^%%python3?']},
            'magic_shell'         :{'reg':['^%%bash']},
            'magic_r'             :{'reg':['^%%R']},
            'magic_text/x-cython' :{'reg':['^%%cython']},
        },
    };

    ImageProcessingCell.msg_cells = {};

    ImageProcessingCell.prototype = Object.create(Cell.prototype);

     /**ImageProcessingCell.prototype.cell_type = "ImageProcessingCell"; */
    /** @method create_element */
    ImageProcessingCell.prototype.create_element = function () {
        Cell.prototype.create_element.apply(this, arguments);
        var that = this;

        var cell =  $('<div></div>').addClass('cell imageprocessing_cell');
        cell.attr('tabindex','2');

        var input = $('<div></div>').addClass('input');
        this.input = input;

        var prompt_container = $('<div/>').addClass('prompt_container');

        var run_this_cell = $('<div></div>').addClass('run_this_cell');
        run_this_cell.prop('title', 'Run this cell');
        run_this_cell.append('<i class="fa-step-forward fa"></i>');
        run_this_cell.click(function (event) {
            event.stopImmediatePropagation();
            that.execute();
        });

        var prompt = $('<div/>').addClass('prompt input_prompt');
        
        var inner_cell = $('<div/>').addClass('inner_cell');
        this.celltoolbar = new celltoolbar.CellToolbar({
            cell: this, 
            notebook: this.notebook});
        inner_cell.append(this.celltoolbar.element);
        var input_area = $('<div/>').addClass('input_area').attr("aria-label", i18n.msg._("Edit code here"));

        this.canvas = $("<canvas height='300'></canvas>");
        this.scene = new VPE.Scene(this.canvas.get(0));

        let fit_to_width_callback = this.scene.fitToParentWidth.bind(this.scene);
        // The width of scene parent is zero at current frame
        window.requestAnimationFrame(function(){
           fit_to_width_callback();
        });
        window.addEventListener("resize", fit_to_width_callback);
        this._DoNothing = function doNothing(e) {
            e.stopPropagation();
            e.preventDefault();
            return false;
        };
        this.canvas.get(0).addEventListener("contextmenu", this._DoNothing);

        input_area.append(this.canvas);
        inner_cell.append(input_area);
        this.input_area = input_area;
        prompt_container.append(prompt).append(run_this_cell);
        input.append(prompt_container).append(inner_cell);

        var output = $('<div></div>');
        cell.append(input).append(output);

        this.element = cell;
        this.output_area = new outputarea.OutputArea({
            config: this.config,
            selector: output,
            prompt_area: true,
            events: this.events,
            keyboard_manager: this.keyboard_manager,
        });
        this.completer = new completer.Completer(this, this.events);
    };

function htmlToElement(html) {
    var template = document.createElement('template');
    html = html.trim(); // Never return a text node of whitespace as the result
    template.innerHTML = html;
    return template.content.firstChild;
}

    ImageProcessingCell.prototype.createDialogExample1 = function (element) {
        // var html = "<canvas></canvas>";
        // var content = htmlToElement(html);
        // showDialog(element, 'dialog', 'Editor', content);
        // var graph = new LiteGraph.LGraph();
        // var code_string =  JSON.parse('{"last_node_id":11,"last_link_id":4,"nodes":[{"id":9,"type":"image/imwrite","pos":[520,105],"size":[140,50],"flags":{},"order":3,"mode":0,"inputs":[{"name":"image","type":"numpy.ndarray","link":4}],"properties":{"value":"C:\\\\Users\\\\fech01-admin\\\\LennaCopy.png"}},{"id":8,"type":"image/imread","pos":[182,95],"size":[140,50],"flags":{},"order":0,"mode":0,"outputs":[{"name":"image","type":"numpy.ndarray","links":[4],"slot_index":0}],"properties":{"value":"C:\\\\Users\\\\fech01-admin\\\\Lenna.png"}},{"id":11,"type":"math/operation","pos":[314,201],"size":[100,60],"flags":{},"order":1,"mode":0,"inputs":[{"name":"A","type":"number,array,object","link":null},{"name":"B","type":"number","link":null}],"outputs":[{"name":"=","type":"number","links":null}],"properties":{"A":1,"B":1,"OP":"+"}},{"id":10,"type":"image/Gaussian2DFilter","pos":[731,197],"size":[180,50],"flags":{},"order":2,"mode":0,"inputs":[{"name":"input","type":"numpy.ndarray","link":null},{"name":"sigma","type":"number","link":null}],"outputs":[{"name":"output","type":"numpy.ndarray","links":null}],"properties":{"sigma":1}}],"links":[[4,8,0,9,0,"numpy.ndarray"]],"groups":[],"config":{},"extra":{},"version":0.4}');
        // graph.configure( code_string );
        // var graph_canvas = new LiteGraph.LGraphCanvas(content, graph);

    };

    /** @method bind_events */
    ImageProcessingCell.prototype.bind_events = function () {
        var that = this;
       // We trigger events so that Cell doesn't have to depend on Notebook.
        that.element.click(function (event) {
            that._on_click(event);
        });

        this.canvas.on("focus", function() {
                if (!that.selected) {
                    that.events.trigger('select.Cell', {'cell':that});
                }
                that.events.trigger('edit_mode.Cell', {cell: that});
            });

         this.canvas.on("blur", function() {
                 that.events.trigger('command_mode.Cell', {cell: that});
            });

         this.input_area.focusin(
             function() {
                if (!that.selected) {
                    that.events.trigger('select.Cell', {'cell':that});
                }
                that.events.trigger('edit_mode.Cell', {cell: that});
            });

        this.canvas.on("click", function() {
                this.setAttribute('tabindex', '0');
                this.focus();
                if (!that.selected) {
                    that.events.trigger('select.Cell', {'cell':that});
                }
                that.events.trigger('edit_mode.Cell', {cell: that});
            });


        this.element.dblclick(function () {
            if (that.selected === false) {
                this.events.trigger('select.Cell', {'cell':that});
            }
        });

        this.element.focusout(
            function() { that.auto_highlight(); }
        );

        this.events.on('kernel_restarting.Kernel', function() {
            if (that.input_prompt_number === '*') {
              that.set_input_prompt();
            }
        });
    };


    /**
     *  This method gets called in CodeMirror's onKeyDown/onKeyPress
     *  handlers and is used to provide custom key handling. Its return
     *  value is used to determine if CodeMirror should ignore the event:
     *  true = ignore, false = don't ignore.
     *  @method handle_codemirror_keyevent
     */

    ImageProcessingCell.prototype.handle_codemirror_keyevent = function (editor, event) {

        var that = this;
        // whatever key is pressed, first, cancel the tooltip request before
        // they are sent, and remove tooltip if any, except for tab again
        var tooltip_closed = null;
        if (event.type === 'keydown' && event.which !== keycodes.tab ) {
            tooltip_closed = this.tooltip.remove_and_cancel_tooltip();
        }

        var cur = editor.getCursor();
        if (event.keyCode === keycodes.enter){
            this.auto_highlight();
        }

        if (event.which === keycodes.down && event.type === 'keypress' && this.tooltip.time_before_tooltip >= 0) {
            // triger on keypress (!) otherwise inconsistent event.which depending on platform
            // browser and keyboard layout !
            // Pressing '(' , request tooltip, don't forget to reappend it
            // The second argument says to hide the tooltip if the docstring
            // is actually empty
            this.tooltip.pending(that, true);
        } else if ( tooltip_closed && event.which === keycodes.esc && event.type === 'keydown') {
            // If tooltip is active, cancel it.  The call to
            // remove_and_cancel_tooltip above doesn't pass, force=true.
            // Because of this it won't actually close the tooltip
            // if it is in sticky mode. Thus, we have to check again if it is open
            // and close it with force=true.
            if (!this.tooltip._hidden) {
                this.tooltip.remove_and_cancel_tooltip(true);
            }
            // If we closed the tooltip, don't let CM or the global handlers
            // handle this event.
            event.codemirrorIgnore = true;
            event._ipkmIgnore = true;
            event.preventDefault();
            return true;
        } else if (event.keyCode === keycodes.tab && event.type === 'keydown' && event.shiftKey) {
                if (editor.somethingSelected() || editor.getSelections().length !== 1){
                    var anchor = editor.getCursor("anchor");
                    var head = editor.getCursor("head");
                    if( anchor.line !== head.line){
                        return false;
                    }
                }
                var pre_cursor = editor.getRange({line:cur.line,ch:0},cur);
                if (pre_cursor.trim() === "") {
                    // Don't show tooltip if the part of the line before the cursor
                    // is empty.  In this case, let CodeMirror handle indentation.
                    return false;
                } 
                this.tooltip.request(that);
                event.codemirrorIgnore = true;
                event.preventDefault();
                return true;
        } else if (event.keyCode === keycodes.tab && event.type === 'keydown') {
            // Tab completion.
            this.tooltip.remove_and_cancel_tooltip();

            // completion does not work on multicursor, it might be possible though in some cases
            if (editor.somethingSelected() || editor.getSelections().length > 1) {
                return false;
            }
            var pre_cursor = editor.getRange({line:cur.line,ch:0},cur);
            if (pre_cursor.trim() === "") {
                // Don't autocomplete if the part of the line before the cursor
                // is empty.  In this case, let CodeMirror handle indentation.
                return false;
            } else {
                event.codemirrorIgnore = true;
                event.preventDefault();
                this.completer.startCompletion();
                return true;
            }
        } 
        
        // keyboard event wasn't one of those unique to code cells, let's see
        // if it's one of the generic ones (i.e. check edit mode shortcuts)
        return Cell.prototype.handle_codemirror_keyevent.apply(this, [editor, event]);
    };

    // Kernel related calls.

    ImageProcessingCell.prototype.set_kernel = function (kernel) {
        this.kernel = kernel;
    };

    ImageProcessingCell.prototype.clearHistory = function(){
      return;
    };

    /**
     * Execute current code cell to the kernel
     * @method execute
     */
    ImageProcessingCell.prototype.execute = function (stop_on_error) {
        if (!this.kernel) {
            console.log(i18n.msg._("Can't execute cell since kernel is not set."));
            return;
        }

        if (stop_on_error === undefined) {
            if (this.metadata !== undefined && 
                    this.metadata.tags !== undefined) {
                if (this.metadata.tags.indexOf('raises-exception') !== -1) {
                    stop_on_error = false;
                } else {
                    stop_on_error = true;
                }
            } else {
               stop_on_error = true;
            }
        }

        this.clear_output(false, true);
        var old_msg_id = this.last_msg_id;
        if (old_msg_id) {
            this.kernel.clear_callbacks_for_msg(old_msg_id);
            delete ImageProcessingCell.msg_cells[old_msg_id];
            this.last_msg_id = null;
        }
        if (this.get_text().trim().length === 0) {
            // nothing to do
            this.set_input_prompt(null);
            return;
        }
        this.set_input_prompt('*');
        this.element.addClass("running");
        var callbacks = this.get_callbacks();
        
        this.last_msg_id = this.kernel.execute(this.get_source_code(), callbacks, {silent: false, store_history: true,
            stop_on_error : stop_on_error});
        ImageProcessingCell.msg_cells[this.last_msg_id] = this;
        this.render();
        this.events.trigger('execute.ImageProcessingCell', {cell: this});
        var that = this;
        function handleFinished(evt, data) {
            if (that.kernel.id === data.kernel.id && that.last_msg_id === data.msg_id) {
                    that.events.trigger('finished_execute.CodeCell', {cell: that});
                that.events.off('finished_iopub.Kernel', handleFinished);
              }
        }
        this.events.on('finished_iopub.Kernel', handleFinished);
    };
    
    /**
     * Construct the default callbacks for
     * @method get_callbacks
     */
    ImageProcessingCell.prototype.get_callbacks = function () {
        var that = this;
        return {
            clear_on_done: false,
            shell : {
                reply : $.proxy(this._handle_execute_reply, this),
                payload : {
                    set_next_input : $.proxy(this._handle_set_next_input, this),
                    page : $.proxy(this._open_with_pager, this)
                }
            },
            iopub : {
                output : function() { 
                    that.events.trigger('set_dirty.Notebook', {value: true});
                    that.output_area.handle_output.apply(that.output_area, arguments);
                }, 
                clear_output : function() { 
                    that.events.trigger('set_dirty.Notebook', {value: true});
                    that.output_area.handle_clear_output.apply(that.output_area, arguments);
                }, 
            },
            input : $.proxy(this._handle_input_request, this),
        };
    };
    
    ImageProcessingCell.prototype._open_with_pager = function (payload) {
        this.events.trigger('open_with_text.Pager', payload);
    };

    /**
     * @method _handle_execute_reply
     * @private
     */
    ImageProcessingCell.prototype._handle_execute_reply = function (msg) {
        this.set_input_prompt(msg.content.execution_count);
        this.element.removeClass("running");
        this.events.trigger('set_dirty.Notebook', {value: true});
    };

    /**
     * @method _handle_set_next_input
     * @private
     */
    ImageProcessingCell.prototype._handle_set_next_input = function (payload) {
        var data = {
            cell: this,
            text: payload.text,
            replace: payload.replace,
            clear_output: payload.clear_output,
        };
        this.events.trigger('set_next_input.Notebook', data);
    };

    /**
     * @method _handle_input_request
     * @private
     */
    ImageProcessingCell.prototype._handle_input_request = function (msg) {
        this.output_area.append_raw_input(msg);
    };


    // Basic cell manipulation.

    ImageProcessingCell.prototype.select = function () {
        var cont = Cell.prototype.select.apply(this, arguments);
        if (cont) {
        //     // this.code_mirror.refresh();
             this.auto_highlight();
        }
        return cont;
    };

    ImageProcessingCell.prototype.render = function () {
        var cont = Cell.prototype.render.apply(this, arguments);
        // Always execute, even if we are already in the rendered state
        return cont;
    };
    
    ImageProcessingCell.prototype.select_all = function () {
        var start = {line: 0, ch: 0};
        var nlines = this.code_mirror.lineCount();
        var last_line = this.code_mirror.getLine(nlines-1);
        var end = {line: nlines-1, ch: last_line.length};
        this.code_mirror.setSelection(start, end);
    };


    ImageProcessingCell.prototype.collapse_output = function () {
        this.output_area.collapse();
    };


    ImageProcessingCell.prototype.expand_output = function () {
        this.output_area.expand();
        this.output_area.unscroll_area();
    };

    ImageProcessingCell.prototype.scroll_output = function () {
        this.output_area.expand();
        this.output_area.scroll_if_long();
    };

    ImageProcessingCell.prototype.toggle_output = function () {
        this.output_area.toggle_output();
    };

    ImageProcessingCell.prototype.toggle_output_scroll = function () {
        this.output_area.toggle_scroll();
    };

    /**
     * enter the edit mode for the cell
     * @method command_mode
     * @return is the action being taken
     */
    ImageProcessingCell.prototype.edit_mode = function () {
        if (this.mode !== 'edit') {
            this.mode = 'edit';
            this.scene.start();
            return true;
        } else {
            return false;
        }
    };

    ImageProcessingCell.prototype.command_mode = function () {
        if (this.mode !== 'command') {
            this.mode = 'command';
            this.scene.stop();
            return true;
        } else {
            return false;
        }
    };

    ImageProcessingCell.input_prompt_classical = function (prompt_value, lines_number) {
        var ns;
        if (prompt_value === undefined || prompt_value === null) {
            ns = "&nbsp;";
        } else {
            ns = encodeURIComponent(prompt_value);
        }
        return '<bdi>'+i18n.msg._('In')+'</bdi>&nbsp;[' + ns + ']:';
    };

    ImageProcessingCell.input_prompt_continuation = function (prompt_value, lines_number) {
        var html = [ImageProcessingCell.input_prompt_classical(prompt_value, lines_number)];
        for(var i=1; i < lines_number; i++) {
            html.push(['...:']);
        }
        return html.join('<br/>');
    };

    ImageProcessingCell.input_prompt_function = ImageProcessingCell.input_prompt_classical;


    ImageProcessingCell.prototype.set_input_prompt = function (number) {
        var nline = 1;
        // if (this.code_mirror !== undefined) {
        //    nline = this.code_mirror.lineCount();
        // }
        this.input_prompt_number = number;
        var prompt_html = ImageProcessingCell.input_prompt_function(this.input_prompt_number, nline);

        // This HTML call is okay because the user contents are escaped.
        this.element.find('div.input_prompt').html(prompt_html);
        this.events.trigger('set_dirty.Notebook', {value: true});
    };


    ImageProcessingCell.prototype.clear_input = function () {
       // this.code_mirror.setValue('');
    };


    ImageProcessingCell.prototype.get_text = function () {
        var data = this.scene.graph.serialize();

        return JSON.stringify(data);
        //return ;this.code_mirror.getValue();
    };

    ImageProcessingCell.prototype.get_source_code = function () {
        var data = this.scene.graph.sourceCode();
        console.log(data);
        return data;
    };


    ImageProcessingCell.prototype.set_text = function (code) {
        if(!code)
            return;
        var code_string =  JSON.parse(code);
        return this.scene.graph.configure( code_string );
    };


    ImageProcessingCell.prototype.clear_output = function (wait, ignore_queue) {
        this.events.trigger('clear_output.CodeCell', {cell: this});
        this.output_area.clear_output(wait, ignore_queue);
        this.set_input_prompt();
    };


    // JSON serialization

    ImageProcessingCell.prototype.fromJSON = function (data) {
        Cell.prototype.fromJSON.apply(this, arguments);
        if (data.cell_type === 'imageprocessingcell') {
            if (data.source !== undefined) {
                this.set_text(data.source);
                // make this value the starting point, so that we can only undo
                // to this state, instead of a blank cell
                // this.code_mirror.clearHistory();
                // this.auto_highlight();
            }
            // this.set_input_prompt(data.execution_count);
            // this.output_area.trusted = data.metadata.trusted || false;
            // this.output_area.fromJSON(data.outputs, data.metadata);
        }
    };


    ImageProcessingCell.prototype.toJSON = function () {
        var data = Cell.prototype.toJSON.apply(this);
        data.source = this.get_text();
        // // is finite protect against undefined and '*' value
        // if (isFinite(this.input_prompt_number)) {
        //     data.execution_count = this.input_prompt_number;
        // } else {
        //     data.execution_count = null;
        // }
        var outputs = this.output_area.toJSON();
        data.outputs = outputs;
        data.metadata.trusted = this.output_area.trusted;
        if (this.output_area.collapsed) {
            data.metadata.collapsed = this.output_area.collapsed;
        } else {
            delete data.metadata.collapsed;
        }
        if (this.output_area.scroll_state === 'auto') {
            delete data.metadata.scrolled;
        } else {
            data.metadata.scrolled = this.output_area.scroll_state;
        }
        return data;
    };

    /**
     * handle cell level logic when the cell is unselected
     * @method unselect
     * @return is the action being taken
     */
    ImageProcessingCell.prototype.unselect = function() {
        var cont = Cell.prototype.unselect.apply(this, arguments);
        if (cont) {
            // When a code cell is unselected, make sure that the corresponding
            // tooltip and completer to that cell is closed.
            this.tooltip.remove_and_cancel_tooltip(true);
            // if (this.completer !== null) {
            //     this.completer.close();
            // }
        }
        return cont;
    };

    ImageProcessingCell.prototype.getCursor = function(){
        return null;
    };

    ImageProcessingCell.prototype.setCursor = function(cursor){
        return;
    };

    ImageProcessingCell.prototype.refresh = function ()
    {
    };

    // Backwards compatibility.
    IPython.CodeCell = ImageProcessingCell;

    return {'ImageProcessingCell': ImageProcessingCell};
});
