/* ------------  
   control.js

   Requires global.js, jquery-1.8.1.min.js, jquery-ui-1.8.23.custom.min.js.
   
   Routines for the hardware simulation, NOT for our client OS itself. In this manner, it's A LITTLE BIT like a hypervisor,
   in that the Document envorinment inside a browser is the "bare metal" (so to speak) for which we write code that
   hosts our client OS. But that analogy only goes so far, and the lines are blurred, because we are using JavaScript in 
   both the host and client environments.
   
   This (and other host/simulation scripts) is the only place that we should see "web" code, like 
   DOM manipulation and JavaScript event handling, and so on.  (index.html is the only place for markup.)
   
   This code references page numbers in the text book: 
   Operating System Concepts 8th edition by Silberschatz, Galvin, and Gagne.  ISBN 978-0-470-12872-5
   ------------ */
  
// Document Initialization
$(document).ready(function() 
{
    Control.init();
    
    // Temp - autostart for debugging
   	//Control.hostStart($("#btnStartOS")[0]);
});

function Control() {}

/**
 * Initializes the necessary elements to simulate the virtual machine in the browser.
 */
Control.init = function() 
{
    // Set up the web stuff
    $("#mainContent").hide();
    
    StatusBar.setStatus("Shutdown");
    
    CpuDisplay.init();
    MemoryDisplay.init();
    HardDriveDisplay.init();
    ReadyQueueDisplay.init();
    
    ProgramInput.init();
    
    ControlMode.init();
};

/**
 * Returns the OS's canvas element (to imitate the shell).
 * 
 * @return {Object} the canvas
 */
Control.getCanvas = function()
{
    return $('#display')[0];
};

/**
 * Returns true if the canvas is focused.
 * 
 * @return {Boolean} true if the canvas is focused, false otherwise 
 */
Control.isCanvasFocused = function()
{
	return $("#display").is(":focus");
}

/**
 * Logs a message to the host's log. 
 * 
 * @param {String} message the message to log
 * @param {String} source (optional) the messages source
 */
Control.log = function(message, source)
{
    // Check the source.
    if (!source)
        source = "?";

    // Note the OS CLOCK.
    var clock = _OsClock;

    // Update the log console.
    Log.add(message, source, clock);
    // Optionally udpate a log database or some streaming service.
};

/**
 * Simulates starting the machine given the start "button."
 * 
 * @param {Object} button the button calling this function
 */
Control.hostStart = function(button)
{
    if (button) // The button that called this function
    {
        // Disable the start button...
        button.disabled = true;
    
        // Start starting animation
        StatusBar.setStatus("Starting...");
        $('#mainContent').fadeIn(500, Control.hostStart);
    }
    else // This function is calling the second part of this function after the animation.
    {
        // Enable the Halt and Reset buttons ...
        $("#btnHaltOS")[0].disabled = false;
        $("#btnReset")[0].disabled = false;
        
        // Create and initialize the CPU
        _CPU = new Cpu();
        
        // Then set the clock pulse simulation.
        Control.hardwareClockId = setInterval(Control.clockPulse, CPU_CLOCK_INTERVAL);
        // Call the OS Kernel Bootstrap routine.
        Kernel.bootstrap();
        
        // Indicate to user that the machine has started.
        StatusBar.setStatus("Operating");
    }
};

/**
 * Simulates halting the machine given the halt "button." 
 * 
 * @param {Object} button the button calling this function
 */
Control.hostHalt = function(button)
{
    if (!button)
        button = document.getElementById("btnHaltOS");
        
    button.disabled = true;
    
    Control.log("Emergency halt.", "Host");
    Control.log("Attempting Kernel shutdown.", "Host");
    
    // Call the OS sutdown routine.
    Kernel.shutdown();
    // Stop the JavaScript interval that's simulating our clock pulse.
    clearInterval(Control.hardwareClockId);
    
    // TODO: Is there anything else we need to do here?
    
    // Indicate to user the OS has halted
    StatusBar.setStatus("Halted");
};

/**
 * Simulates reseting the machine given the reset "button."
 *  
 * @param {Object} button the button calling this function
 */
Control.hostReset = function(button)
{
    if (button)
    {
        StatusBar.setStatus("Shutting down...");
        $('#mainContent').fadeOut(500, Control.hostReset);
    }
    else
    {
        // The easiest and most thorough way to do this is to reload (not refresh) the document.
        location.reload(true);
        
        // The other way 
        /*
        clearInterval(Control.hardwareClockId);
        
        _OsClock = 0;
        
        _Console.toggleCursor(false);
        
        Pcb.lastPid = 0;
        
        Log.clear();
        MemoryDisplay.clear();
        ReadyQueueDisplay.clear();
        
        $("#btnStartOS")[0].disabled = false;
        $("#btnHaltOS")[0].disabled = true;
        $("#btnReset")[0].disabled = true;
        
        Control.init();
        */
    }
};

Control.memoryDisplayOn = true;

Control.toggleMemoryHddDisplay = function()
{
	var controlFlip;
	
	if (Control.memoryDisplayOn)
	{
		controlFlip = function() // Switch to HDD
		{
			$("#memoryHeader").hide();
			$("#memoryDisplay").hide();
			$("#hddHeader").show();
			$("#hddDisplay").show();
			$("#hddOptions").show();
		}
	}
	else
	{
		controlFlip = function() // Switch to Memory
		{
			$("#hddHeader").hide();
			$("#hddDisplay").hide();
			$("#hddOptions").hide();
			$("#memoryHeader").show();
			$("#memoryDisplay").show();
		}
	}
	
	Control.memoryDisplayOn = !Control.memoryDisplayOn;
	
	// Update HDD display when switching to it.
	if (!Control.memoryDisplayOn)
		HardDriveDisplay.update();
	
	$("#memoryContainer").rotate3Di('toggle', 'slow', { sideChange : controlFlip });
}

Control.hardwareClockId = null;
Control.singleStep = false;

/**
 * Toggles the single step functionality. 
 */
Control.toggleSingleStep = function()
{
	if (Control.singleStep)
	{
		$("#chkbxSingleStep").css("background-image", "url('images/check-empty.png')");
		if (Control.hardwareClockId == null)
			Control.hardwareClockId = setInterval(Control.clockPulse, CPU_CLOCK_INTERVAL);
	}
	else
	{
		$("#chkbxSingleStep").css("background-image", "url('images/check-full.png')");
	}
	
	Control.singleStep = !Control.singleStep;
}

/**
 * Simulates a clock pulse initiated by the host. 
 * 
 * @param {Object} button (optional) the button calling this function. This parameter is used to
 *     identify a pulse initiated by the single step button as opposed to the hardware clock, which 
 *     does not effect a CPU cycle when single step is enabled.    
 */
Control.clockPulse = function(button)
{
    // Increment the hardware (host) clock.
   	_OsClock++;
   	// Call the kernel clock pulse event handler.
   	Kernel.onCpuClockPulse(button);
   	
   	// If the CPU is not executing, update the displays regardless of single step status.
   	//   Else the CPU is executing, don't update if single step is enabled unless the single step
   	//   button was pressed.
   	// When this function is called by the clock interval, no button is passed in.
   	if (!_CPU.isExecuting || !Control.singleStep || button != null)
   	{
	    CpuDisplay.update();
	    ReadyQueueDisplay.update();
	    
	    if (Control.memoryDisplayOn)
	    	MemoryDisplay.update();
    }
};

Control.onKeypress = function(event)
{
    // Check that we are processing keystrokes only from the canvas's id (as set in index.html).
    if (event.target.id == "display")
    {
        event.preventDefault();
        // Note the pressed key code in the params (Mozilla-specific).
        var params = new Array(event.which, event.shiftKey, event.ctrlKey);
        // Enqueue this interrupt on the kernal interrupt queue so that it gets to the Interrupt handler.
        Kernel.interrupt(KEYBOARD_IRQ, params);
    }
};

Control.enableKeyboardInterrupt = function()
{
    // Listen for key presses (keydown, actually) in the document 
    // and call the simulation processor, which will in turn call the 
    // os interrupt handler.
    document.addEventListener("keydown", Control.onKeypress, false);
};

Control.disableKeyboardInterrupt = function()
{
    document.removeEventListener("keydown", Control.onKeypress, false);
};