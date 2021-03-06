/* ----------
   deviceDriverHardDrive.js
   
   
   ---------- */
  
DeviceDriverHDD.prototype = new DeviceDriver;

// The main directory sector 
DeviceDriverHDD.DIRECTORY_SECTOR = 0;

/**
 * Creates a new Hard Drive Device Driver. 
 */
function DeviceDriverHDD()
{
	this.hardDrive = null;
	
	this.buffer = "";
}

/**
 * Hard Drive Device Driver initialization. 
 */
DeviceDriverHDD.prototype.driverEntry = function()
{
	this.hardDrive = new HardDrive();
};

/**
 * The interrupt servicing routine for the hard drive.
 * 
 * @param params an array of parameters to act upon in this ISR. 
 */
DeviceDriverHDD.prototype.isr = function(params)
{
	var command = params[0];
	var filename = params[1]; // Will be undefined if the command is format or list.
	var data = params[2]; // Will be undefined if the command is not write.
	
	try
	{
		switch (command)
		{
			// Shell commands
			case "create":
				this.createFile(filename);
				_StdIn.putMessage("File created.");
				break;
			case "read":
				_StdIn.putMessage(this.readFile(filename));
				break;
			case "write":
				this.writeFile(filename, data);
				_StdIn.putMessage("File written.");
				break;
			case "delete":
				this.deleteFile(filename);
				_StdIn.putMessage("File deleted.");
				break;
			case "list":
				this.listFiles();
				break;
			case "format":
				this.format();
				_StdIn.putMessage("Format successful.");
				break;
			
			// Swap commands
			case "swap-write":
				this.createFile(filename, true);
				this.writeFile(filename, data, true);
				break;
			case "swap-read":
				this.buffer = this.read(filename);
				break;
			case "swap-delete":
				this.deleteFile(filename);
				break;
			
			default:
				Kernel.trapError("Invalid HDD Driver command.");
		}
	}
	catch (e)
	{
		if (!(/swap/).test(command))
			_StdIn.putMessage(e);
		else
			Kernel.trace("Swap file error: " + e);
	}
	
	// Update the display for convenience
	//if (Control.memoryDisplayOn)
	//	Control.toggleMemoryHddDisplay();
	HardDriveDisplay.update();
};

/**
 * Creates the specified file.
 * 
 * @param {String} filename the file
 * @param {Boolean} forSwap true if this operation is for swapping
 */
DeviceDriverHDD.prototype.createFile = function(filename, forSwap)
{
	Kernel.trace("Creating file: " + filename);
	
	try
	{
		var filenameFile = this.findFile(filename);
	}
	catch (e)
	{
		var file = this.findFreeFile();
		file.setData(filename);
		file.setLinkedTSB(0, 0, 0);
		file.writeToDrive(this.hardDrive);
		return;
	}
	
	if (!forSwap)
		throw "Error: File already exists.";
};

/**
 * Reads the specified file.
 * 
 * @param filename the file
 */
DeviceDriverHDD.prototype.readFile = function(filename)
{
	Kernel.trace("Reading file: " + filename);
	
	var filenameFile = this.findFile(filename);
	
	if (!filenameFile.isLinked())
		throw "File contains nothing.";;
	
	var contentsFile = this.getLinkedFile(filenameFile);
	
	var contents = contentsFile.getData();
	
	while (contentsFile.isLinked())
	{
		contentsFile = this.getLinkedFile(contentsFile);
		contents += contentsFile.getData();
	}
	
	return contents;
};

/**
 * Writes data to the specified file (overwrites; does not append).
 * 
 * @param filename the file
 */
DeviceDriverHDD.prototype.writeFile = function(filename, data, binaryData)
{
	Kernel.trace("Writing to file: " + filename + " " + data);
	
	/*
	 * filenameFile - the file in the directory containing the name and linked TSB
	 * files - an array of file objects containing the contents of the file to store.
	 * currentFile - the current file of the iteration
	 * file - the file shifted from the front of files
	 * foundFiles - an array of the final file objects found to store the file's contents
	 */
	
	var filenameFile = this.findFile(filename);
	
	this.deleteFileChain(filenameFile);
	
	var files = File.filesFromData(data, binaryData);
	
	var iterator = new HardDriveIterator(this.hardDrive);
	iterator.setStart(1, 0, 0);
	
	var element, currentFile, file, foundFiles = [];
	
	while ((element = iterator.next()) && files.length > 0)
	{
		currentFile = File.fileFromStr(element);
		if (currentFile.isAvailable())
		{
			file = files.shift();
			file.setTSB(iterator.track, iterator.sector, iterator.block);
			foundFiles.push(file);
		}
	}
	
	if (files.length > 0)
		throw "Not enough free space for contents.";
	
	// Link filename file to file contents.
	filenameFile.setLinkedTSB(foundFiles[0].track, foundFiles[0].sector, foundFiles[0].block);
	filenameFile.writeToDrive(this.hardDrive);

	// Link all contents files to the following file except for the last and write to drive.
	for (var i = 0; i < foundFiles.length - 1; i++)
	{
		foundFiles[i].setLinkedTSB(foundFiles[i + 1].track, foundFiles[i + 1].sector, foundFiles[i + 1].block);
		foundFiles[i].writeToDrive(this.hardDrive);
	}
	
	// Write the last file.
	foundFiles[foundFiles.length - 1].writeToDrive(this.hardDrive);
};

/**
 * Deletes the specified file.
 * 
 * @param filename the file
 */
DeviceDriverHDD.prototype.deleteFile = function(filename)
{
	Kernel.trace("Deleting file: " + filename);
	
	if (filename === "MBR")
		throw "Cannot delete MBR.";
	
	this.deleteFileChain(this.findFile(filename), true);
};

/**
 * Deletes (sets as available) the chain of files starting with the specified file.
 * 
 * @param {File} file the first file of the chain to delete
 * @param {Boolean} inclusive true if the first file in the chain should also be deleted. 
 */
DeviceDriverHDD.prototype.deleteFileChain = function(file, inclusive)
{
	if (inclusive)
		file.deleteFromDrive(this.hardDrive);
	
	if (!file.isLinked())
		return;
		
	var nextFile = this.getFile(file.linkedTrack, file.linkedSector, file.linkedBlock);
	nextFile.deleteFromDrive(this.hardDrive);
	
	while (nextFile.isLinked())
	{
		nextFile = this.getFile(nextFile.linkedTrack, nextFile.linkedSector, nextFile.linkedBlock);
		nextFile.deleteFromDrive(this.hardDrive);
	} 
}

/**
 * Lists the files to the console.
 */
DeviceDriverHDD.prototype.listFiles = function()
{
	var iterator = new HardDriveIterator(this.hardDrive), element, file;
	iterator.setTermination(0, 7, 7);
	
	_StdIn.advanceLine();
	
	while (element = iterator.next())
	{
		file = File.fileFromStr(element);
		if (!file.isAvailable())
		{
			_StdIn.putText(" " + file.getData());
			_StdIn.advanceLine();
		}
	}
	
	_OsShell.putPrompt();
}

/**
 * Formats the hard drive (i.e. zero-fills it).
 */
DeviceDriverHDD.prototype.format = function()
{
	Kernel.trace("Formatting hard drive...");
	
	var t, s, b;
	
	var data = "";
	
	// Each hex character is 4 bits, so the block size in bytes * 2 will yield number of hex digits per block.
	data = data.pad(this.hardDrive.blockSize * 2, "0");
	
	var iterator = new HardDriveIterator(this.hardDrive);
	
	while (!iterator.terminated)
	{
		iterator.next();
		this.hardDrive.write(iterator.track, iterator.sector, iterator.block, data);
	}
	
	this.hardDrive.write(0, 0, 0, Kernel.MBR.toFileString());
};

/**
 * Finds and returns the specified file.
 * 
 * @param {String} filename the file's name
 *  
 * @return {File} the file
 */
DeviceDriverHDD.prototype.findFile = function(filename)
{
	var iterator = new HardDriveIterator(this.hardDrive), element, file, currentFilename;
	iterator.setTermination(0, 7, 7);
	
	while (element = iterator.next())
	{
		file = File.fileFromStr(element);
		currentFilename = file.getData();
		if (!file.isAvailable() && currentFilename === filename)
		{
			file.setTSB(iterator.track, iterator.sector, iterator.block);
			return file;
		}
	}
	
	throw "File not found: " + filename;
}

/**
 * Returns the file located at the TSB of this driver's hard drive or null if the file doesn't exist.
 * 
 * @param {Number} track the track
 * @param {Number} sector the sector
 * @param {Number} block the block
 * 
 * @return {File} the file
 */
DeviceDriverHDD.prototype.getFile = function(track, sector, block)
{
	try
	{
		var file = File.fileFromStr(this.hardDrive.read(track, sector, block));
		file.setTSB(track, sector, block);
		return file;
	}
	catch (e)
	{
		return null;
	}
};

/**
 * Returns the file linked from the specified file.
 * 
 * @param {File} file the linking file
 * 
 * @return {File} the linked file
 */
DeviceDriverHDD.prototype.getLinkedFile = function(file)
{
	try
	{
		var linkedFile = File.fileFromStr(this.hardDrive.read(file.linkedTrack, file.linkedSector, file.linkedBlock));
		linkedFile.setTSB(file.linkedTrack, file.linkedSector, file.linkedBlock);
		return linkedFile;
	}
	catch (e)
	{
		return null;
	}
};

/**
 * Finds and return the first free file space to store a file name in the main directory. 
 * 
 * @return {File} the first free file space
 */
DeviceDriverHDD.prototype.findFreeFile = function()
{
	var iterator = new HardDriveIterator(this.hardDrive), element, file;
	iterator.setTermination(0, 7, 7); // Directory is the first track
	
	while (!iterator.terminated)
	{
		file = File.fileFromStr(iterator.next());
		if (file.isAvailable())
		{
			file.setTSB(iterator.track, iterator.sector, iterator.block);
			return file;
		}
	}
	
	throw "Cannot create file; directory full.";
};

/**
 * Returns the contents of the hard drive. For display purposes only. 
 * 
 * @return {Array} the hard drive's contents
 */
DeviceDriverHDD.prototype.getContents = function()
{
	var t, s, b;
	
	var data = [];
	
	for (t = 0; t < this.hardDrive.tracks; t++)
	{
		data.push([]);
		
		for (s = 0; s < this.hardDrive.sectors; s++)
		{
			data[t].push([]);
			
			for (b = 0; b < this.hardDrive.blocksPer; b++)
			{
				data[t][s].push(this.hardDrive.read(t, s, b));
			}
		}
	}
	
	return data;
};


/**
 * A convenience object used to iterate through a hard drive's contents.
 *  
 * @param {HardDrive} hardDrive the hard drive to be iterated through.
 */
function HardDriveIterator(hardDrive)
{
	this.hardDrive = hardDrive;
	
	this.track = 0;
	this.sector = 0;
	this.block = -1; // Start 1 less as the iterator will increment it
	
	this.terminationTrack = this.hardDrive.tracks - 1;
	this.terminationSector = this.hardDrive.sectors - 1;
	this.terminationBlock = this.hardDrive.blocksPer - 1;
	
	this.terminated = false;
}

/**
 * Test function to test the iterator. 
 */
HardDriveIterator.prototype.iterate = function()
{
	this.setTermination(0,7,7);
	
	var element, i = 0;
	while (element = this.next())
	{
		console.log((i++) + " " + this.track + ":" + this.sector + ":" + this.block + " " + element);
	}
	
	//console.log((i++) + " " + this.track + ":" + this.sector + ":" + this.block + " " + element);
};

/**
 * Returns the next element of the hard drive or null if the element doesn't exist.
 * 
 * @return {String} the next element
 */
HardDriveIterator.prototype.next = function()
{
	this.increment();
	
	if (this.terminated)
		return null;
	
	return this.hardDrive.read(this.track, this.sector, this.block);
};

/** 
 * Sets the track, sector, and block to start at (inclusive).
 * 
 * @param {Number} track the track
 * @param {Number} sector the sector
 * @param {Number} block the block
 */
HardDriveIterator.prototype.setStart = function(track, sector, block)
{
	this.track = track != null ? track : this.track;
	this.sector = sector != null ? sector : this.sector;
	this.block = block != null ? block - 1 : this.block - 1;
};

/** 
 * Sets the track, sector, and block to terminate at (inclusive).
 * 
 * @param {Number} track the track
 * @param {Number} sector the sector
 * @param {Number} block the block
 */
HardDriveIterator.prototype.setTermination = function(track, sector, block)
{
	this.terminationTrack = track != null ? track : this.terminationTrack;
	this.terminationSector = sector != null ? sector : this.terminationSector;
	this.terminationBlock = block != null ? block : this.terminationBlock;
};

/**
 * Terminates the iterator. 
 */
HardDriveIterator.prototype.terminate = function()
{
	this.track = -1;
	this.sector = -1;
	this.block = -1;
	this.terminated = true;
}

/** 
 * Moves this iterator to the next iteration. 
 */
HardDriveIterator.prototype.increment = function()
{	
	// Check for termination.
	if (this.terminated)
		return;
	if (this.track === this.terminationTrack &&
		this.sector === this.terminationSector &&
		this.block === this.terminationBlock)
	{
		this.terminate();
		return;
	}
	
	// Increment TSB
	this.block++;
	
	if (this.block >= this.hardDrive.blocksPer)
	{
		this.block = 0;
		this.sector++;
		
		if (this.sector >= this.hardDrive.sectors)
		{
			this.sector = 0;
			this.track++;
			
			if (this.track > this.hardDrive.tracks)
			{
				this.terminate();
			}
		}
	}
};
