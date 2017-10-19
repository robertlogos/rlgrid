/**
 * Created by rlopez on 15/03/17.
 */
(function (){

    "use strict";

    var RLGrid = function(oOptions){


        this.$ = function ( sSelector, oOptions )
        {
            return $(this).find(sSelector, oOptions);
        };


        this.fnGetActions = function(sAction){
            return $(this).find('td[data-action=\"'+sAction+'\"] > a');
        };


        this.fnHideActions = function(aActions){
            if(aActions === undefined){
                $(this).find('[data-action]').filter('[data-action!=\"toggle\"]').children().hide();
                $('thead th[data-action=\"toggle\"]').first().children().hide();
            }
            else{
                $(this).find('tr td[data-action=\"' + aActions.join('\"], [data-action=\"') +'\"]').children().hide();
            }
        };


        this.fnShowActions = function (aActions){
            if(aActions === undefined){
                $(this).find('[data-action]').filter('[data-action!=\"toggle\"]').children().show();
                $('thead th[data-action=\"toggle\"]').first().children().show();
            }
            else{
                $(this).find('[data-action=\"' + aActions.join('\"], [data-action=\"') +'\"]').children().show();
            }

        };


        this.fnRestore = function (){
            this.fnShowActions();
            this.fnHideActions(["save", "cancel"]);
        };


        this.fnIsChanged = function (){
            var bChanged = false;
            if ($(this).find(':input[data-ischange="true"]').length > 0) bChanged = true;
            return bChanged;
        };


        this.fnUndo = function (){
            $(this).find(':input[data-ischange="true"]').each(function(){
               this.value = this.defaultValue;
            });
        };


        //Init params
        var oDefaultOptions = {
            bCollapsed : true,
            sLocale : 'ES',
            bEdit: true,
            bInsert: true,
            bDelete: true,
            bConfirmDelete: true,
            iMaxlength: 64,
            fnNewCallback: _cbInsert,
            fnUpdateCallback: _cbUpdate,
            fnDeleteCallback: _cbDelete,
            bShowErrorCodes: false
        };

        $.extend(oDefaultOptions, oOptions);

        //Global variables
        var iLevels = 1;
        const $that = this;
        const anRows = [];
        const anProtoRows = [];
        const Messages = {
            'ES':   {
                'canceledit'    : 'Hay cambios pendientes. Seguro que deseas cancelar ?',
                "cancelinsert"  : 'Los datos se perderán. Seguro que deseas cancelar ?',
                'servererror'   : 'Se ha producido un error actualizando el servidor',
                'requirederror' : 'El campo es obligatorio',
                'confirmdelete' : 'Se va a eliminar el registro. Estás seguro ?'
            },
            'EN':   {
                'canceledit'    : 'There are pending changes. Really want to cancel ?',
                "cancelinsert"  : 'Data will to be lost. Are you sure to cancel ?',
                'servererror'   : 'There has been an error updating the server',
                'requirederror' : 'The field is required',
                'confirmdelete' : 'The register will be deleted. Are you sure ?'

            },
            'get':  function(key, locale){
                return this[locale ? locale.toUpperCase(): this.defaultLocale][key];
            },
            'defaultLocale' : oDefaultOptions.sLocale
        };


        //Default values for missing attributes and sanity check
        $('thead th').each(function(){
            if($(this).attr('data-editable') === undefined){
                $(this).attr('data-editable', 'false');
            }
            if($(this).attr('data-required') === undefined){
                $(this).attr('data-required', 'true');
            }
            if($(this).attr('data-maxlength') === undefined){
                $(this).attr('data-maxlength', oDefaultOptions.iMaxlength);
            }

            //TODO: sanity check
        });

        //Calculate the number of data levels from the header
        $('thead th[data-level]').each(function() {
            const iLevel = parseInt($(this).attr('data-level'));
            if(iLevel > iLevels) iLevels = iLevel;
        });

        //Populate the tbody rows array
        $('tbody tr').each(function(index){
            $(this).attr('data-rowidx', index);
            $(this).attr('data-numchilds', 0);
            $(this).attr('data-parentid', -1);

            anRows.push($(this));
        });

        //Set the numchilds and parentid properties for every row
        for(var i=1; i<iLevels; i++){
            $('tbody tr[data-level='+i+']').each(function(){
                var rowidx = $(this).attr('data-rowidx')*1;
                var numchilds = $(this).attr('data-numchilds')*1;

                var j = rowidx+1;
                while((j<anRows.length) && (anRows[j].attr('data-level')==i+1)){
                    anRows[j].attr('data-parentid', rowidx);
                    numchilds++;
                    j++;
                }
                $(this).attr('data-numchilds', numchilds);
            });
        }

        //Replicate header attributes to tbody td's
        $('thead th').each(function(index, value){

            $('tbody tr td:nth-child(' + (index + 1) + ')').each(function(){

                const td = $(this);

                //Copy all data- attributes
                $.each(value.attributes, function(){
                    if(this.name.startsWith('data-')){
                        td.attr(this.name, this.value);
                    }
                });

                if(td.parent().attr('data-level') !== td.attr('data-level')){
                    td.attr('data-editable', 'false');
                }

            });

        });


        //Insert a column for toggle action at every datalevel column start
        for(var i=1; i<=iLevels; i++){
            var iPosition = $('thead th[data-level='+i+']:first').index();
            _fnAddColumn('data-action="toggle"', iPosition+1);
        }

        //Insert New Edit Delete Save and Cancel action columns
        if(oDefaultOptions.bInsert) _fnAddColumn('data-action="insert"');
        if(oDefaultOptions.bEdit) _fnAddColumn('data-action="edit"');
        if(oDefaultOptions.bDelete) _fnAddColumn('data-action="delete"');
        _fnAddColumn('data-action="save"');
        _fnAddColumn('data-action="cancel"');

        //Initialize anchors and functions for every action

        anRows.forEach(row => _initializeRow(row));

        //Initialize empty (hidden) row prototypes for New action
        for(var i=1; i<=iLevels; i++) {
            anProtoRows[i-1]=_newRowPrototype(i);
        }


        if(oDefaultOptions.bInsert) {
            $('thead th[data-action=\"toggle\"]').first().html(new _insertRootAction());
        }

        //Initialize visual styles (.css)
        _initializeStyles();


        this.fnRestore();

        return this;

        // **** Initialization End


        // **************
        // BUTTON ACTIONS
        // **************

        function _toggleAction(iRowIdx, bCollapsed){
            const nAction = $('<a href="javascript:void(0);"></a>');
            nAction.attr('data-actionid', iRowIdx);
            nAction.addClass('rlicon rltoggle-on');
            nAction.click(function(){
                $('tr[data-parentid=' + iRowIdx + ']').toggle();
                $(this).toggleClass('rltoggle-off');

                if(anRows[iRowIdx].attr('data-collapsed') === 'false')
                    anRows[iRowIdx].attr('data-collapsed', 'true');
                else
                    anRows[iRowIdx].attr('data-collapsed', 'false');

            });
            return nAction;
        }


        function _updateAction(iRowIdx){
            var nAction = $('<a href="javascript:void(0);"></a>');
            nAction.attr('data-actionid', iRowIdx);
            nAction.addClass('rlicon rledit');
            nAction.click(function(){
                const row = anRows[$(this).attr('data-actionid')];
                $that.fnHideActions();
                row.fnShowActions(["save", "cancel"]);
                row.enableEdit();

            });
            return nAction;
        }


        function _saveUpdateAction(iRowIdx){
            var nAction = $('<a href="javascript:void(0);"></a>');
            nAction.attr('data-actionid', iRowIdx);
            nAction.addClass('rlicon rlsave');
            nAction.click(function(){
                const row = anRows[iRowIdx];

                if(!_checkInputs(row)){
                    alert(Messages.get('requirederror'));
                    return;
                }

                const oResult = oDefaultOptions.fnUpdateCallback(_getUpdateRecord(row));

                if(!oResult.success){
                    let sErrCode = oDefaultOptions.bShowErrorCodes ? ' ('+oResult.errcode+')' : '';
                    alert(Messages.get('servererror') + sErrCode);
                    return;
                }

                row.disableEdit();
                $that.fnRestore();

            });
            return nAction;
        }


        function _cancelUpdateAction(iRowIdx){
            var nAction = $('<a href="javascript:void(0);"></a>');
            nAction.attr('data-actionid', iRowIdx);
            nAction.addClass('rlicon rlcancel');
            nAction.click(function(){
                const row = anRows[$(this).attr('data-actionid')];
                if(row.fnIsChanged()){
                    if(confirm(Messages.get('canceledit')))
                        row.fnUndo();
                    else return;
                }
                row.disableEdit();
                $that.fnRestore();
            });
            return nAction;
        }


        function _deleteAction(iRowIdx){
            var nAction = $('<a href="javascript:void(0);"></a>');
            nAction.attr('data-actionid', iRowIdx);
            nAction.addClass('rlicon rldelete');
            nAction.click(function(){
                const row = anRows[$(this).attr('data-actionid')];

                if(oDefaultOptions.bConfirmDelete){
                    if(!confirm(Messages.get('confirmdelete'))) return;
                }

                const oResult = oDefaultOptions.fnDeleteCallback(_getDeleteRecord(row));

                if(!oResult.success){
                    let sErrCode = oDefaultOptions.bShowErrorCodes ? ' ('+oResult.errcode+')' : '';
                    alert(Messages.get('servererror') + sErrCode);
                    return;
                }

                const parentId = row.attr('data-parentid');
                if(parentId != -1){
                    const nParentRow = anRows[parentId];
                    const iNumChilds = parseInt(nParentRow.attr('data-numchilds'));
                    nParentRow.attr('data-numchilds', iNumChilds-1)

                    if(iNumChilds === 1){
                        nParentRow.fnGetActions('toggle').detach();
                    }
                }

                const aRowsToDelete = [row];
                for(let i=0; i<aRowsToDelete.length; i++){
                    $('tbody tr[data-parentid=\"'+aRowsToDelete[i].attr('data-rowidx')+'\"]').each(function(){
                        aRowsToDelete.push($(this));
                    });
                }

                for (let i in aRowsToDelete){
                    aRowsToDelete[i].detach();
                }


            });
            return nAction;
        }

        function _insertAction(iRowIdx){
            var nAction = $('<a href="javascript:void(0);"></a>');
            nAction.attr('data-actionid', iRowIdx);
            nAction.addClass('rlicon rlinsert');
            nAction.click(function(){
                $that.fnHideActions();
                const row = anRows[iRowIdx];
                if(row.attr("data-collapsed") === 'true'){
                    row.fnGetActions('toggle').trigger('click');
                }
                const iLevel = parseInt(row.attr('data-level'));
                const nProtoRow = anProtoRows[iLevel];


                row.after(nProtoRow);

                //nProtoRow.show();
                nProtoRow.enableEdit();

            });
            return nAction;
        }


        function _insertRootAction(){
            var nAction = $('<a href="javascript:void(0);"></a>');
            nAction.addClass('rlicon rlinsertroot');
            //nAction.attr('data-action', 'insertroot');
            nAction.click(function(){
                $that.fnHideActions();
                const nProtoRow = anProtoRows[0];

                $('tbody').prepend(nProtoRow);

                //nProtoRow.show();
                nProtoRow.enableEdit();

            });
            return nAction;

        }


        function _saveNewAction(iLevel){
            var nAction = $('<a href="javascript:void(0);"></a>');
            nAction.addClass('rlicon rlsave');
            nAction.click(function(){
                const row = anProtoRows[iLevel-1];

                if(!_checkInputs(row)){
                    alert(Messages.get('requirederror'));
                    return;
                }

                const oResult = oDefaultOptions.fnNewCallback(_getNewRecord(row));

                if(!oResult.success){
                    let sErrCode = oDefaultOptions.bShowErrorCodes ? ' ('+oResult.errcode+')' : '';
                    alert(Messages.get('servererror') + sErrCode);
                    return;
                }

                //Get the rowId from the parent register
                var iRowIdx = -1;
                const nPreviousRow = row.prev();
                if(nPreviousRow.length !== 0) {
                    iRowIdx = parseInt(nPreviousRow.attr('data-rowidx'));
                    const iNumChilds = parseInt(nPreviousRow.attr('data-numchilds'));
                    if(iNumChilds === 0){
                        //Add the Toggle action
                        //TODO: addChild as a row function
                        nPreviousRow.children('td[data-action=\"toggle\"]').eq(iLevel-2).html(new _toggleAction(iRowIdx));
                        nPreviousRow.attr('data-collapsed', 'false');
                    }
                    nPreviousRow.attr('data-numchilds', iNumChilds+1);
                }

                //Convert the prototype row into a new table row
                row.disableEdit();
                row.attr('data-id', oResult.id);
                row.attr('data-parentid', iRowIdx);
                row.attr('data-rowidx', anRows.length);
                row.attr('data-numchilds', 0);
                _initializeRow(row);
                anRows.push(row);

                //Create a new empty prototype row
                anProtoRows[iLevel-1] = _newRowPrototype(iLevel);

                $that.fnRestore();

            });
            return nAction;
        }


        function _cancelNewAction(iLevel){
            var nAction = $('<a href="javascript:void(0);"></a>');
            nAction.addClass('rlicon rlcancel');
            nAction.click(function(){
                const row = anProtoRows[iLevel-1];
                if(row.fnIsChanged()){
                    if(confirm(Messages.get('cancelinsert'))) {
                        row.fnUndo();
                    }
                    else return;
                }
                row.detach();
                row.disableEdit();
                $that.fnRestore();
            });
            return nAction;
        }


        // ******
        // UTILITY FUNCTIONS FOR GRID INITIALIZATION
        // *******

        function _initializeStyles(){

            //thead
            $('thead').each(function(){
                $(this).addClass('rlhead');
            });
            $('thead tr').each(function(){
                $(this).addClass('rlhead');
            });
            $('thead th').each(function(){
                $(this).addClass('rlhead');
            });

            //tbody
            $('tbody').each(function(){
                $(this).addClass('rlbody');
            });
            $('tbody tr').each(function(){
                $(this).addClass('rlbody');
            });
            $('tbody td').each(function(){
                $(this).addClass('rlbody');
            });

            //tfoot
            $('tfoot').each(function(){
                $(this).addClass('rlfoot');
            });
            $('tfoot tr').each(function(){
                $(this).addClass('rlfoot');
            });
            $('tfoot td').each(function(){
                $(this).addClass('rlfoot');
            });

        }


        function _initializeRow(row){

            row.hideActions     = $that.fnHideActions;
            row.fnShowActions   = $that.fnShowActions;
            row.fnGetActions    = $that.fnGetActions;
            row.fnIsChanged     = $that.fnIsChanged;
            row.fnUndo          = $that.fnUndo;
            row.enableEdit      = _fnEnableEdit;
            row.disableEdit     = _fnDisableEdit;

            const iRowIdx = row.attr('data-rowidx');
            const iDataLevel = row.attr('data-level');

            //Toggle Action
            if(row.attr('data-numchilds')>0){
                row.children('td[data-action=\"toggle\"]').eq(iDataLevel-1).html(new _toggleAction(iRowIdx));
                row.attr('data-collapsed', 'false');
                if(oDefaultOptions.bCollapsed){
                    row.fnGetActions('toggle').trigger('click');
                    row.attr('data-collapsed', 'true');
                }
            }
            //New action
            if (iDataLevel < iLevels)
                row.children('td[data-action=\"insert\"]').html(new _insertAction(iRowIdx));
            //Edit action
            if(row.children('td[data-editable=\"true\"]').length >0)
                row.children('td[data-action=\"edit\"]').html(new _updateAction(iRowIdx));
            //Delete action
            row.children('td[data-action=\"delete\"]').html(new _deleteAction(iRowIdx));
            //Save action
            row.children('td[data-action=\"save\"]').html(new _saveUpdateAction(iRowIdx));
            //Cancel action
            row.children('td[data-action=\"cancel\"]').html(new _cancelUpdateAction(iRowIdx));

            return row;
        }


        //Create empty row prototype for given data level
        function _newRowPrototype(iLevel){

            const nProtoRow = $('<tr>');
            nProtoRow.attr('data-level', iLevel);
            nProtoRow.addClass('rlbody');


            $('thead th').each(function () {

                const nCell = $('<td>');
                nCell.addClass('rlbody');

                //Copy all data- attributes from header column definition
                $.each(this.attributes, function(){
                    if(this.name.startsWith('data-')){
                        nCell.attr(this.name, this.value);
                    }
                });


                if (parseInt($(this).attr('data-level')) === iLevel) {
                    nCell.attr('data-editable', $(this).attr('data-editable'));
                }
                else{
                    nCell.attr('data-editable', 'false');
                }

                nProtoRow.append(nCell);
            });

            nProtoRow.children('td[data-action=\"save\"]').html(new _saveNewAction(iLevel));
            nProtoRow.children('td[data-action=\"cancel\"]').html(new _cancelNewAction(iLevel));

            nProtoRow.enableEdit    = _fnEnableEdit;
            nProtoRow.disableEdit   = _fnDisableEdit;
            nProtoRow.fnIsChanged   = $that.fnIsChanged;
            nProtoRow.fnUndo        = $that.fnUndo;
            nProtoRow.fnGetActions  = $that.fnGetActions;
            //console.log(nProtoRow.wrap('<p>').parent().html());
            return nProtoRow;
        }


        function _fnAddColumn(sAttr, iPosition){

            if(iPosition === undefined){
                $('thead th:last-child').after('<th '+sAttr+'/>');
                $('tbody td:last-child').after('<td '+sAttr+'/>');
                $('tfoot td:last-child').after('<td '+sAttr+'/>');
            }
            else{
                $('thead th:nth-child('+iPosition+')').before('<th '+sAttr+'/>');
                $('tbody td:nth-child('+iPosition+')').before('<td '+sAttr+'/>');
                $('tfoot td:nth-child('+iPosition+')').before('<td '+sAttr+'/>');
            }
        }

    };


    $.fn.rlgrid  = RLGrid;


    function _checkInputs(row){

        var bOk = true;

        $(row).find('td[data-editable=\"true\"]').each(function() {
            const val = $(this).children(':first').val();
            if($(this).attr('data-required') === 'true' && val.length === 0){
                $(this).children(':first').focus();
                bOk = false;
            }
        });

        return bOk;
    }


    function _fnEnableEdit(){
        $(this).find('td[data-editable=\"true\"]').each(function(index, value){
            const html = $(this).html();
            const input = $('<input type="text" />')
                .attr('value', html)  //Be aware of jQuery's treatment of HTMLInputElement default values
                .attr('class', 'rlinput')
                .attr('maxlength', $(this).attr('data-maxlength'))
                .change(function(){
                    $(this).attr('data-ischange', 'true');
                    $(this).attr('class', 'rlinput-change');
                });
            $(this).html(input);

            if(index === 0){

                $(this).children(':first').focus();


            }
        });
    }


    function _fnDisableEdit(){
        $(this).find('td[data-editable=\"true\"]').each(function(){
            const val = $(this).children(':first').val();
            $(this).html(val);

        });
    }


    // *************************************
    // Action callback functions
    // ***********************************

    //Generate the data record for New register action
    function _getNewRecord(row){
        const oRecord = {'data-level' : row.attr('data-level')};
        row.find('td[data-editable=\"true\"]').each(function(){
            oRecord[$(this).attr('data-property')] = $(this).children(':first').val();
        });
        //console.log(JSON.stringify(oRecord));
        return oRecord;
    }

    //Generate the data record for register update
    function _getUpdateRecord(row){
        const oRecord = { 'data-level' : row.attr('data-level'), 'data-id' : row.attr('data-id')};
        row.find('td>input[data-ischange="true"]').parent().each(function(){
            oRecord[$(this).attr('data-property')] = $(this).children(':first').val();
        });
        return oRecord;
    }

    //Generate the data record for register update
    function _getDeleteRecord(row){
        const oRecord = { 'data-level' : row.attr('data-level'), 'data-id' : row.attr('data-id')};

        return oRecord;
    }



    //***** Dummy server callbacks for debugging purposes

    //Virtual server callbacks for New action
    function _cbInsert(oData){
        console.log('*** Callback. Insert record with data:' + JSON.stringify(oData));
        const oResult = {
            success: true,
            errcode: 110,
            id: 121
        };

        return oResult;
    }


    //Virtual server callback for Update action
    function _cbUpdate(oData){
        console.log('*** Callback. Update record with data:' + JSON.stringify(oData));
        const oResult = {
            success: true,
            errcode: 120,
            id: oData['data-id']
        };

        return oResult;
    }


    //Virtual server callback for Delete action
    function _cbDelete(oData){
        console.log('*** Callback. Delete record with data:' + JSON.stringify(oData));
        const oResult = {
            success: true,
            errcode: 130,
            id: oData['data-id']
        };

        return oResult;
    }


})();


function _fnLogRow(row){
    console.log('rowidx='+row.data('rowidx')+', id='+row.data('id')
        +', level='+row.data('level')+', parentid='+row.data('parentid')
        +', numchilds='+row.data('numchilds')
    );

}