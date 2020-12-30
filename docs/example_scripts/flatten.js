var FILL_GROUND = "minecraft:dirt"
var FILL_WITH_FALL_DAMAGE = true

var centerPlayer = function() {
    player.pressingForward = false;
    while (player.motionX * player.motionX + player.motionZ * player.motionZ > 0.001)
        tick();
    if (Math.abs(Math.floor(player.x) + 0.5 - player.x) >= 0.2 || Math.abs(Math.floor(player.z) + 0.5 - player.z) >= 0.2)
        return player.moveTo(Math.floor(player.x) + 0.5, Math.floor(player.z) + 0.5);
    return true;
};
var canWalkThrough = function(block) {
    return block === "air" || block === "cave_air" || block === "torch";
};
var canWalkOn = function(block) {
    if (canWalkThrough(block))
        return false;
    return !BlockState.defaultState(block).liquid;
};


var getTool = function(block) {
    // Tall grass
    if(BlockState.defaultState(block).hardness === 0){
        return null
    }
    var effective = function(item, block) {
        var stack = ItemStack.of(item);
        if (!BlockState.defaultState(block).canBreakByHand && !stack.isEffectiveOn(block))
            return false;
        return stack.getMiningSpeed(block) > 1;
    };
    if (effective("diamond_pickaxe", block))
        return "pickaxe";
    if (effective("diamond_shovel", block))
        return "shovel";
    if (effective("diamond_axe", block))
        return "axe";
    if (effective("diamond_sword", block))
        return "sword";
    return null;
};
var mineBlock = function(x, y, z) {
    var toolMaterialOrder = ["netherite","diamond", "iron", "stone", "wooden", "golden"];
    var tool = getTool(world.getBlock(x, y, z));
    if (tool) {
        var picked = false;
        for (var i = 0; i < toolMaterialOrder.length; i++) {
            if (player.pick(toolMaterialOrder[i] + "_" + tool)) {
                picked = true;
                break;
            }
        }
        if (!picked && !world.getBlockState(x, y, z).canBreakByHand)
            throw new Error('No tool available and cannot break by hand');
    } else {
        player.pick('dirt')
    }

    var oldBlock = world.getBlock(x, y, z);
    if (oldBlock === "air") return true;
    var failCount = 0;
    do {
        if (!player.longMineBlock(x, y, z)) {
            failCount++;
            tick();
        }
        if (failCount > 5)
            throw new Error("Block pos: (" + x + ", " + y + ", " + z + ")");
    } while (world.getBlock(x, y, z) === oldBlock);

    var stateAbove = world.getBlockState(x, y + 1, z);
    if (stateAbove.fallable) {
        while (world.getBlock(x, y, z) !== stateAbove.block)
            tick();
        if (!mineBlock(x, y, z))
            throw new Error();
    }

    return true;
};
var placeBlock = function(x, y, z) {
    if (!player.pick(function(itemNbt) {
        return itemNbt.id === FILL_GROUND;
    }))
        throw new Error('No Dirt to place');

    if (player.rightClick(x - 1, y, z, "east")) return true;
    if (player.rightClick(x + 1, y, z, "west")) return true;
    if (player.rightClick(x, y, z - 1, "south")) return true;
    if (player.rightClick(x, y, z + 1, "north")) return true;
    if (player.rightClick(x, y - 1, z, "up")) return true;
    if (player.rightClick(x, y + 1, z, "down")) return true;
    return false;
};
var makeBridge = function(x, y, z, dx, dz) {
    // face backwards
    player.lookAt(player.x - dx, player.y, player.z - dz);
    // sneak backwards
    var continueSneaking = function() {
        player.pressingBack = true;
        tick();
        timeout++;
        if (timeout % 20 === 0) {
            player.pressingBack = false;
            player.sneaking = false;
            if (!clearWay(x, y, z, dx, dz)) {
                player.unblockInput();
                throw new Error();
            }
            player.sneaking = true;
        }
        return true;
    };
    player.blockInput();
    player.sneaking = true;
    var timeout = 0;
    while (Math.floor(player.x) === x && Math.floor(player.z) === z) {
        if (!continueSneaking())
            throw new Error();
    }
    // keep sneaking for an extra 5 ticks to make sure there's part of the block in view
    for (var i = 0; i < 5; i++) {
        if (!continueSneaking())
            throw new Error();
    }
    player.pressingBack = false;
    player.sneaking = false;
    player.unblockInput();
    return placeBlock(x + dx, y - 1, z + dz);
};
var clearWay = function(x, y, z, dx, dz, fill) {
    // mine block in front of player
    for(var i = 5; i >= 0; i--){
        if (!canWalkThrough(world.getBlock(x + dx, y + i, z + dz))) {
            if (!mineBlock(x + dx, y + i, z + dz)) {
                throw new Error();
            }
        }
    }
    // build bridge if necessary
    if (fill) {
        centerPlayer()
        var deepestPoint = 0
        for(var i = - 1; i >= -20; i--){
            if(!canWalkOn(world.getBlock(x + dx, y + i, z + dz))){
                deepestPoint = i
            } else {
                break
            }
        }
        if(deepestPoint == 0) return true
        if(deepestPoint >= -3){
            player.blockInput()
            player.sneaking = true
            for(var i = deepestPoint; i < 0; i++){
                if(!placeBlock(x + dx, y + i, z + dz)){
                    throw new Error('Cannot fill ground')
                }
            }
            player.sneaking = false
            player.unblockInput()
        } else {
            if(FILL_WITH_FALL_DAMAGE){
                print('Jump down')
                player.moveTo(x + dx + 0.5, z + dz + 0.5, false)
                // Pillar up
                player.blockInput()
                for(var wait = 0; wait < 10; wait++) tick()
                centerPlayer()
                for(var i = deepestPoint; i < 0; i++){
                    player.jumping = true
                    while(!placeBlock(x + dx, y + i, z + dz)) {
                        tick()
                    }
                }
                player.jumping = false
                for(var wait = 0; wait < 10; wait++) tick()
                player.unblockInput()
            } else {
                print('Cannot fill; Enable fall damage')
            }
        }
    } else {
        if (!canWalkOn(world.getBlock(x + dx, y - 1, z + dz))) {
            if (!makeBridge(x, y, z, dx, dz)) {
                throw new Error();
            }
        }
    }
    return true;
};

var mineSection = function (x1, x2, y, z1, z2, fillBelow) {
    centerPlayer()
    // Go to starting point
    if(!player.pathTo(x1, y, z1)) {
        Error('Cannot reach starting point')
    }
    var lastRow = x1 === x2
    for(var x = x1; x !== x2 || lastRow; x = (x1 < x2 ? x + 1: x - 1)){
        // Mine row
        for(var z = z1; z !== z2; z = (z1 < z2 ? z + 1: z - 1)){
            clearWay(x, y, z, 0, (z1 < z2 ? 1: -1), fillBelow)
            player.moveTo(x + 0.5, z + 0.5, false)
        }
        // Move to last block
        player.moveTo(x + 0.5, z2 + 0.5, false)
        // Mine next starting position
        if(!lastRow){
            clearWay(x, y, z2, (x1 < x2 ? 1: -1), 0, fillBelow)
            player.moveTo(x + (x1 < x2 ? 1: -1) + 0.5, z2 + 0.5, false)
        } else {
            break
        }
        //centerPlayer()
        // Switch z1 and z2
        z = z2
        z2 = z1
        z1 = z
        if((x1 < x2 ? x + 1: x - 1) === x2) lastRow = true
    }
}

var getBoundaries = function () {
    print('Welcome')
    print('Define the area to be flattened by sneaking')
    print('Please sneak on the the two corner blocks')
    var boundaries = []
    while (true) {
        if (player.sneaking) {
            if(boundaries.length === 1){
                if(boundaries[0][1] === player.y){
                    boundaries.push([Math.floor(player.x), Math.floor(player.y), Math.floor(player.z)])
                    print('Got boundaries')
                    break;
                } else {
                    print('Please select the second boundary block on the same height')
                    print('Height of the first block is ' + boundaries[0][1])
                }
            } else {
                boundaries.push([Math.floor(player.x), Math.floor(player.y), Math.floor(player.z)])
                print('Got first corner')
            }
            // Wait until no input
            while (player.sneaking) {
                tick()
            }
        }
        tick()
    }
    player.sneaking = false
    return boundaries
}

var flattenLoop = function () {
    try {
        var boundaries = getBoundaries()
        mineSection(boundaries[1][0], boundaries[0][0], boundaries[0][1], boundaries[1][2], boundaries[0][2], true)
        print('Completed')
    } finally {
        mainThread.kill();
    }
}

var mainThread = Thread.current;

new Thread(flattenLoop).run();

while (true) tick(); // keep running until killed