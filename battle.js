class Combatant {
    constructor(name, attrs) {
        this.name = name;
        this.hp = attrs.hp || 100;
        this.maxHp = attrs.hp || 100;
        this.atk = attrs.atk || 10;
        this.def = attrs.def || 5;
        this.speed = attrs.speed || 10;
        this.critRate = attrs.critRate || 0.1;
        this.critDmg = attrs.critDmg || 1.5;
        this.energy = 0;
        this.maxEnergy = 100;
        this.skills = attrs.skills || []; // 结构: { name: string, cost: number, effect: function }
        this.buffs = []; // 结构: { name: string, duration: number, effect: function }
        this.isAlive = true;
        this.shield = 0;
    }

    takeDamage(damage, source, isSkill = false) {
        let reducedDamage = Math.max(1, Math.floor(damage - this.def * 0.4));
        
        // 护盾逻辑
        if (this.shield > 0) {
            if (this.shield >= reducedDamage) {
                this.shield -= reducedDamage;
                return { actualDamage: 0, shieldAbsorb: reducedDamage };
            } else {
                const absorbed = this.shield;
                reducedDamage -= this.shield;
                this.shield = 0;
                this.hp -= reducedDamage;
                if (this.hp <= 0) { this.hp = 0; this.isAlive = false; }
                return { actualDamage: reducedDamage, shieldAbsorb: absorbed };
            }
        }

        this.hp -= reducedDamage;
        if (this.hp <= 0) {
            this.hp = 0;
            this.isAlive = false;
        }
        return { actualDamage: reducedDamage, shieldAbsorb: 0 };
    }

    attack(target) {
        // 能量回复
        this.energy = Math.min(this.maxEnergy, this.energy + 20);

        // 检查是否可以使用大招 (能量满且有技能)
        if (this.energy >= 100 && this.skills.length > 0) {
            const skillName = this.skills[Math.floor(Math.random() * this.skills.length)];
            this.energy = 0;
            return this.useSkill(skillName, target);
        }

        let isCrit = Math.random() < this.critRate;
        let damage = this.atk;
        if (isCrit) damage *= this.critDmg;
        
        const result = target.takeDamage(damage, this);
        return { 
            type: 'attack',
            damage: result.actualDamage, 
            shieldAbsorb: result.shieldAbsorb,
            isCrit 
        };
    }

    useSkill(skillName, target) {
        let damage = this.atk * 2.5; // 技能倍率
        let effectMsg = "";
        
        // 模拟不同技能效果
        if (skillName.includes("崩星") || skillName.includes("绝技")) {
            damage = this.atk * 4;
            effectMsg = "触发了毁灭性打击！";
        } else if (skillName.includes("重击")) {
            damage = this.atk * 2;
            effectMsg = "附带了击退效果！";
        }

        const result = target.takeDamage(damage, this, true);
        return {
            type: 'skill',
            skillName,
            damage: result.actualDamage,
            shieldAbsorb: result.shieldAbsorb,
            effectMsg
        };
    }
}

class BattleEngine {
    constructor(player, enemies, onLog) {
        this.player = player;
        this.enemies = enemies;
        this.onLog = onLog;
        this.turnCount = 0;
        this.isFinished = false;
        this.winner = null;
    }

    async start() {
        this.log("⚔️ 战斗正式开始！双方进入战场...", "info");
        while (!this.isFinished) {
            await this.nextTurn();
            if (this.turnCount >= 50) {
                this.log("⌛ 战斗陷入僵局（超过50回合），系统判定平局！", "warning");
                this.isFinished = true;
                break;
            }
        }
    }

    async nextTurn() {
        this.turnCount++;
        this.log(`【 第 ${this.turnCount} 回合 】`, "turn");

        const all = [this.player, ...this.enemies.filter(e => e.isAlive)].sort((a, b) => b.speed - a.speed);

        for (const actor of all) {
            if (!actor.isAlive || this.isFinished) continue;

            let action;
            let target;

            if (actor === this.player) {
                target = this.enemies.find(e => e.isAlive);
                if (!target) {
                    this.finish("player", "🎉 恭喜！所有敌人已被消灭。");
                    break;
                }
            } else {
                target = this.player;
            }

            action = actor.attack(target);
            this.renderAction(actor, target, action);

            if (!target.isAlive) {
                if (target === this.player) {
                    this.finish("enemies", "💀 玩家已战败，请强化属性后再试。");
                    break;
                } else {
                    this.log(`🚩 ${target.name} 受到致命伤，已退出战斗。`, "death");
                }
            }

            // 实时感：根据动作类型调整延迟
            const delay = action.type === 'skill' ? 800 : 400;
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        if (!this.isFinished && this.enemies.every(e => !e.isAlive)) {
            this.finish("player", "🏆 战斗胜利！获得大量经验与金币奖励。");
        }
    }

    renderAction(actor, target, action) {
        let msg = "";
        let type = "damage";

        if (action.type === 'skill') {
            msg = `✨ ${actor.name} 释放了必杀技【${action.skillName}】！`;
            if (action.effectMsg) msg += ` (${action.effectMsg})`;
            this.log(msg, "info");
            msg = `💥 对 ${target.name} 造成了 ${action.damage} 点真实伤害！`;
            type = "crit";
        } else {
            msg = `🗡️ ${actor.name} 发动普通攻击，`;
            if (action.isCrit) {
                msg += `触发暴击！造成 ${action.damage} 点伤害。`;
                type = "crit";
            } else {
                msg += `造成 ${action.damage} 点伤害。`;
            }
        }

        if (action.shieldAbsorb > 0) {
            msg += ` (其中 ${action.shieldAbsorb} 点被护盾吸收)`;
        }

        this.log(msg, type);
    }

    finish(winner, msg) {
        this.isFinished = true;
        this.winner = winner;
        this.log(msg, winner === "player" ? "success" : "fail");
    }

    log(msg, type) {
        if (this.onLog) {
            this.onLog({ msg, type, time: new Date().toLocaleTimeString().split(' ')[0] });
        }
    }
}

window.Combatant = Combatant;
window.BattleEngine = BattleEngine;
