var Snake = Snake || {};

Snake.MOBILE = "ontouchstart" in document;
if (Snake.MOBILE) {
	document.documentElement.className='mobile';
}

Snake.Game = {};

Snake.Game.initStateValues = function() {
	this.state = {
		state: 'menu', // 'menu', 'play', 'end'
		snake: [],
		direction: 'right', // 'right', 'left', 'top', 'down'
		inputBuffer: [],
		board: [],
		boardWidth: 30,
		boardHeight: 30,
		borderOffset: {
			top: 4,
			bottom: 2,
			left: 2,
			right: 2
		},
		holeInTheWall: false,
		score: 0,
		hiscore: this.readHiScore(),
		level: 1,
		mode: 'snake', // snake, sticky, tron
		prevLength: null, // real snake length (during tron mode),
		glitchedLength: 0, // glitched length of snake (during end game animation)
		foodEaten: 0,
		buggyBugTimeLeft: -1, // no buggy bug on the board
		showHint: false
	};
};

Snake.Game.vars = {
	then: null,
	animationId: null
};

Snake.Game.init = function() {
	this.sound = Snake.Sound;
	this.sound.init();

	this.ui = this.ui || Snake.UI;
	this.controls = this.controls || Snake.Controls;
	this.board = this.board || Snake.Board;

	this.initNewGame();

	this.ui.init(this.state);

	this.controls.addListeners(this.onInput.bind(this));

	this.ui.paint(this.state);
};

Snake.Game.initNewGame = function() {
	this.initStateValues();
	this.delayHint();

	//initialise walls on the board
	this.board.initBoard(this.state);

	//initialise snake
	this.initSnake();

	//initialise food
	this.initFood();

	this.vars.then = performance.now();

	// stop previous game loop
	window.cancelAnimationFrame(this.vars.animationId);

	//start the game
	this.loop();
};

Snake.Game.play = function() {
	this.state.state = 'play';
	this.clearHint();
};

Snake.Game.loop = function() {
	this.vars.animationId = window.requestAnimationFrame(this.loop.bind(this));
	var now = performance.now();
	var elapsed = now - this.vars.then;

	var fps = 20; // 20 frames per sec for menu / end game screens

	if (this.state.state === 'play') {
		fps = this.state.level + 4;
		// speed up in tron mode
		if (this.state.mode === 'tron') {
			fps += 3;
		}
	}

	var fpsInterval = 1000 / fps;

	// if enough time has elapsed, draw the next frame
	if (elapsed > fpsInterval) {

		// Get ready for next frame by setting then=now, but also adjust for your
		// specified fpsInterval
		this.vars.then = now - (elapsed % fpsInterval);

		//paint the board in the game loop
		this.tick();
	}
};

Snake.Game.initSnake = function() {
	for (var i = 0; i < 5; i++) { //let's start with snake length 5
		//horizontal snake in the middle
		this.state.snake.push({x: ~~(this.state.boardWidth / 2) + i - 5, y: ~~(this.state.boardHeight / 2)});
	}
};

Snake.Game.random = function(min, max) {
	return Math.floor(Math.random() * (max - min + 1) + min);
};

Snake.Game.delayHint = function(delay) {
	this.clearHint();
	delay = delay || 5000;

	// show controls hint after 5s
	this.hintTimeout = setTimeout(function(state){
		state.showHint = true;
	}, 5000, this.state);
};

Snake.Game.clearHint = function() {
	clearTimeout(this.hintTimeout);
	this.state.showHint = false;
};

Snake.Game.initFood = function() {
	this.initEdible('food');
};

Snake.Game.initBuggyBug = function() {
	this.initEdible('buggybug');
};

Snake.Game.initEdible = function(type) {
	var minX, maxX, minY, maxY, offset = 0;

	var topWallY = this.state.borderOffset.top;
	var bottomWallY = this.state.boardHeight - this.state.borderOffset.bottom - 1;
	var leftWallX = this.state.borderOffset.left;
	var rightWallX = this.state.boardWidth - this.state.borderOffset.right - 1;

	if (this.state.level === 1) { // food on first level always inside of the board
		offset = 1;
	}

	if (!this.state.holeInTheWall) {
		// if there is no hole in the wall yet let food show on walls but not outside
		minX = leftWallX + offset;
		maxX = rightWallX - offset;

		minY = topWallY + offset;
		maxY = bottomWallY - offset;
	} else {
		// if there is a hole, edible can be outside of the board walls
		minX = minY = 0;
		maxX = this.state.boardWidth - 1;
		maxY = this.state.boardHeight - 1;
	}

	//buggy bug has two parts so don't generate left side near the edge because right part won't fit
	if (type === 'buggybug') {
		maxX -= 1;
	}

	// make sure that the edible is not generated on the buggy bug, food or snake
	do {
		var randomX = this.random(minX, maxX);
		var randomY = this.random(minY, maxY);
	} while ((this.state.board[randomX][randomY].type === 'food')
		|| (this.state.board[randomX][randomY].type === 'buggybug')
		|| this.ifCollidedWithSnake(randomX, randomY)
		|| (type === 'buggybug' && this.ifCollidedWithSnake(randomX + 1, randomY))
		||
			// exclude corners, so food don't show in wall corners if there is no hole yet
			// and then it doesn't show in invisible rounded corners
			((randomX === minX && randomY === minY)
			|| (randomX === minX && randomY === maxY)
			|| (randomX === maxX && randomY === minY)
			|| (randomX === maxX && randomY === maxY))
		||
			((randomX === rightWallX && randomY === topWallY) // also exclude top right corner of the wall
			|| (randomX === leftWallX && randomY === topWallY) // top left corner
			|| (randomY === bottomWallY && randomX === rightWallX) // bottom right corner
			|| (randomY === bottomWallY && randomX === leftWallX))); // bottom left corner

	// if edible happens to be on wall glitch opposite wall so snake can go through
	if (this.state.board[randomX][randomY].type === 'wall') {
		this.board.glitchOppositeWall(randomX, randomY, this.state);
		this.state.holeInTheWall = true;

		// if edible is a buggy bug and is located on the top or bottom wall, glitch another wall next to the previous one
		if (type === 'buggybug' && (randomY === topWallY || randomY === bottomWallY)) {
			this.board.glitchOppositeWall(randomX + 1, randomY, this.state);
		}
	}

	this.state.board[randomX][randomY] = {
		type: type
	};

	if (type === 'buggybug') {
		if (this.state.board[randomX + 1][randomY].type === 'wall') { // glitch opposite wall even if only right part is on the wall
			this.board.glitchOppositeWall(randomX + 1, randomY, this.state);
			this.state.holeInTheWall = true;
		}

		// buggybug's body has two parts
		var bugNo = this.random(1, 5);
		this.state.board[randomX][randomY].body = 'bug' + bugNo + 'Left'; // info about the body part
		this.state.board[randomX + 1][randomY] = {
			type: type,
			body: 'bug' + bugNo + 'Right' // info about the body part
		};
		var timeout = this.getDistanceFromHead(randomX, randomY) + 10;
		timeout = timeout - (timeout % 10) + 10;
		this.state.buggyBugTimeLeft = timeout;
	}
};

Snake.Game.getDistanceFromHead = function(x, y) {
	var head = this.state.snake[this.state.snake.length - 1];
	return Math.abs(head.x - x) + Math.abs(head.y - y);
};

Snake.Game.tick = function() {
	var state = this.state;
	// update game state (move snake) when game is playing
	if (state.state === 'play') {
		this.update();
	}

	// animate hiscore on game over screen
	if (state.state === 'end') {
		this.gameOverUpdate();
	}

	// paint everything
	this.ui.paint(this.state);
};

Snake.Game.update = function() {
	// take the snake's head
	var snakeX = this.state.snake[this.state.snake.length - 1].x;
	var snakeY = this.state.snake[this.state.snake.length - 1].y;

	var buggyBugOnBoard = this.findBuggyBugOnBoard();

	// update direction based on input
	if (this.state.inputBuffer.length) {
		do {
			var action = this.state.inputBuffer.shift();
		} while (
			// don't accept input with direction opposite to current
			(action === 'right' && this.state.direction === 'left') ||
			(action === 'left' && this.state.direction === 'right') ||
			(action === 'up' && this.state.direction === 'down') ||
			(action === 'down' && this.state.direction === 'up')
		);
		if (action) {
			this.sound.playMove(this.state.mode);
			this.state.direction = action;
		}
	}

	switch (this.state.direction) {
		case 'right': snakeX++;
			break;
		case 'left': snakeX--;
			break;
		case 'up': snakeY--;
			break;
		case 'down': snakeY++;
			break;
	}

	// if we will get out of the board
	if (snakeX === -1) {
		snakeX = this.state.boardWidth - 1;
	} else if (snakeX === this.state.boardWidth) {
		snakeX = 0;
	} else if (snakeY === -1) {
		snakeY = this.state.boardHeight - 1;
	} else if (snakeY === this.state.boardWidth) {
		snakeY = 0;
	}

	// if the new head position matches the food
	switch (this.state.board[snakeX][snakeY].type) {
		case 'food': this.consumeFood(snakeX, snakeY);
			break;
		case 'buggybug': this.consumeBuggyBug(snakeX, snakeY);
			break;
		default:
			if (this.state.mode === 'snake') {
				this.state.snake.shift(); // remove the first cell - tail
				// make it smaller in every paint
				if (this.state.prevLength && this.state.snake.length > this.state.prevLength) {
					this.glitchSnakeTail(10, this.state.snake.length - this.state.prevLength);
				} else if (this.state.prevLength && this.state.snake.length === this.state.prevLength) { //no need to make it smaller anymore
					this.state.prevLength = null;
					this.state.glitchedLength = 0;
				}
			} else if (this.state.mode === 'tron') {
				this.state.score += 1; // score one point for every piece grown in tron mode
			}
			break;
	}

	if (this.state.mode === 'sticky' && this.state.buggyBugTimeLeft-- < 0) {
		this.state.mode = 'tron';
		this.sound.playEnterTronMode();
	}

	this.checkCollision(snakeX, snakeY);

	if (this.state.board[snakeX][snakeY].type === 'wall'
		&& this.state.board[snakeX][snakeY].isGlitched) {
		this.sound.playGlitchedWall();
		// glitched wall is just one time use 'portal'
		this.state.board[snakeX][snakeY].isGlitched = false;
	}

	this.state.snake.push({
		x: snakeX,
		y: snakeY
	});

	if (buggyBugOnBoard.length === 2) {
		if (this.state.buggyBugTimeLeft === 1) {
			this.removeBuggyBug(buggyBugOnBoard[0].x, buggyBugOnBoard[0].y);
			this.state.buggyBugTimeLeft = -1;
		} else { // decrease remaining time of the buggyBug
			this.state.buggyBugTimeLeft--;
		}
	}
};

Snake.Game.glitchSnakeTail = function(maxGlitchedLength, glitchedLimit) {
	var state = this.state;
	var snake = state.snake;

	var glitchStep = 1 / (maxGlitchedLength + 1);

	// make the snake shorter every frame

	if (state.glitchedLength === maxGlitchedLength || state.glitchedLength >= snake.length) {
		snake.shift();
	}
	for (var i = 0; i <= state.glitchedLength; i++) {
		if (state.snake[i] && (!glitchedLimit || i < glitchedLimit)) {
			state.snake[i].isGlitched = glitchStep * (i+1);
		}
	}
	if (state.glitchedLength < maxGlitchedLength) {
		state.glitchedLength++;
	}
};

Snake.Game.consumeFood = function(snakeX, snakeY) {
	this.sound.playEatFood(this.state.mode);

	this.state.score += 4 + this.state.level;
	this.state.foodEaten += 1;

	if (this.state.foodEaten % 5 === 0) this.state.level += 1;

	this.state.mode = 'snake'; // fix the snake so the tail can move
	this.addEdible(); // add new food before removing old one (to prevent it showing on same place)
	this.state.board[snakeX][snakeY].type = '';

	if (this.state.prevLength) this.state.prevLength += 1;
};

Snake.Game.consumeBuggyBug = function(snakeX, snakeY) {
	this.sound.playEatBuggyBug();

	this.state.mode = 'sticky';
	this.state.score += this.state.buggyBugTimeLeft + this.state.level;
	if (!this.state.prevLength) {
		this.state.prevLength = this.state.snake.length; // need to remember the actual length of the snake
	}

	this.removeBuggyBug(snakeX, snakeY);
};

Snake.Game.removeBuggyBug = function(x, y) {
	this.state.board[x][y].type = '';
	if (this.state.board[x - 1] && this.state.board[x - 1][y].type === 'buggybug') { // remember to remove the second part of the bug
		this.state.board[x - 1][y].type = '';
	} else if (this.state.board[x + 1] && this.state.board[x + 1][y].type === 'buggybug') {
		this.state.board[x + 1][y].type = '';
	}
};

Snake.Game.findBuggyBugOnBoard = function() {
	var bug = [];

	this.state.board.forEach(function(row, indexX) {
		row.forEach(function(cell, indexY) {
			// filter only cells that are buggybug
			if (cell.type === 'buggybug') { // we should find two pieces
				bug.push({
					x: indexX,
					y: indexY,
					body: cell.body
				});
			}
		});
	});

	return bug;
};

Snake.Game.addEdible = function() {
	if (this.state.level > 2 && Math.random() < 0.3 && !this.findBuggyBugOnBoard().length) {
		this.initBuggyBug();
	}
	this.initFood();
};

Snake.Game.checkCollision = function(snakeX, snakeY) {
	if (this.ifCollidedWithSnake(snakeX, snakeY) // if the snake will collide with itself
		|| (this.state.board[snakeX][snakeY].type === 'wall' // or if the snake will collide with the walls
				&& !this.state.board[snakeX][snakeY].isGlitched)) { // but not glitched walls

		this.gameOver();
	}
};

Snake.Game.gameOver = function() {
	this.sound.playDie(this.state.mode);

	if (window.navigator.vibrate) {
		window.navigator.vibrate(400);
	}

	this.state.state = 'end';

	// pause input for a while, so end game screen is not closed by quick input
	this.state.pauseInput = true;
	setTimeout(function(state){
		state.pauseInput = false;
	}, 500, this.state);

	this.delayHint();

	if (this.state.score > this.state.hiscore) {
		this.saveHiScore(this.state.score);
	}
};

Snake.Game.gameOverUpdate = function() {
	var state = this.state;
	var snake = state.snake;

	if (state.score > state.hiscore) {
		this.state.hiscore++;
		if (state.hiscore % 10 === 0) {
			this.sound.playHiScore();
		}
	}
	// make the snake shorter every frame
	if (snake.length) {
		this.glitchSnakeTail(20);
	}
};


Snake.Game.ifCollidedWithSnake = function(x, y) {
	// check if the x/y coordinates exist in the snake array
	return this.state.snake.filter(function(cell) {
		return cell.x === x && cell.y === y && !cell.isGlitched;
	}).length;
};


Snake.Game.onInput = function(action) {
	if (this.state.pauseInput) return;

	if (action === 'mute') {
		this.sound.toggleMute();
	} else if (action === 'pause') {
		if (this.state.state === 'play') {
			this.state.state = 'pause';
		}
	} else {
		switch (this.state.state) {
			case 'end':
				this.state.level = 50; // make sceen glitch a lot for a while
				setTimeout(function(){
					this.initNewGame();
					this.ui.paint(this.state);
				}.bind(this), 500);
				break;
			case 'pause':
				this.state.state = 'play';
			case 'menu':
				this.play();
			case 'play':
			default:
				if (action !== 'start') {
					this.state.inputBuffer.push(action);
				}
		}
	}
};

Snake.Game.readHiScore = function() {
	var hi = 0;
	var score;

	if (localStorage) {
		score = localStorage.getItem('SNAKE_HISCORE');
		score = +score;
		if (!isNaN(score) && score > 0) {
			hi = score;
		}
	}

	return hi;
};

Snake.Game.saveHiScore = function(hi) {
	if (localStorage) {
		localStorage.setItem('SNAKE_HISCORE', hi);
	}
};

Snake.Game.init();
