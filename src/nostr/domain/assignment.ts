export interface BuildingAssignment {
    pubkey: string;
    buildingIndex: number;
}

export interface AssignmentResult {
    assignments: BuildingAssignment[];
    byBuildingIndex: Record<number, string>;
    pubkeyToBuildingIndex: Record<string, number>;
    unassignedPubkeys: string[];
}

function normalizePubkeys(pubkeys: string[], priorityPubkeys: string[] = []): string[] {
    const deduped = [...new Set(pubkeys)];
    const prioritySet = new Set(priorityPubkeys);

    return deduped.sort((left, right) => {
        const leftPriority = prioritySet.has(left) ? 0 : 1;
        const rightPriority = prioritySet.has(right) ? 0 : 1;
        if (leftPriority !== rightPriority) {
            return leftPriority - rightPriority;
        }

        return left.localeCompare(right);
    });
}

function fnv1aHash(input: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }

    return hash >>> 0;
}

export function hashPubkeyToIndex(pubkey: string, capacity: number, seed: string): number {
    if (capacity <= 0) {
        return -1;
    }

    return fnv1aHash(`${seed}:${pubkey}`) % capacity;
}

export function assignPubkeysToBuildings(input: {
    pubkeys: string[];
    buildingsCount: number;
    seed: string;
    priorityPubkeys?: string[];
}): AssignmentResult {
    const capacity = Math.max(0, Math.floor(input.buildingsCount));
    const sortedPubkeys = normalizePubkeys(input.pubkeys, input.priorityPubkeys || []);

    const assignments: BuildingAssignment[] = [];
    const byBuildingIndex: Record<number, string> = {};
    const pubkeyToBuildingIndex: Record<string, number> = {};
    const unassignedPubkeys: string[] = [];
    const occupied = new Array<boolean>(capacity).fill(false);

    for (const pubkey of sortedPubkeys) {
        if (capacity === 0) {
            unassignedPubkeys.push(pubkey);
            continue;
        }

        const baseIndex = hashPubkeyToIndex(pubkey, capacity, input.seed);
        let assignedIndex = -1;

        for (let offset = 0; offset < capacity; offset++) {
            const candidate = (baseIndex + offset) % capacity;
            if (!occupied[candidate]) {
                assignedIndex = candidate;
                break;
            }
        }

        if (assignedIndex < 0) {
            unassignedPubkeys.push(pubkey);
            continue;
        }

        occupied[assignedIndex] = true;
        byBuildingIndex[assignedIndex] = pubkey;
        pubkeyToBuildingIndex[pubkey] = assignedIndex;
        assignments.push({
            pubkey,
            buildingIndex: assignedIndex,
        });
    }

    return {
        assignments,
        byBuildingIndex,
        pubkeyToBuildingIndex,
        unassignedPubkeys,
    };
}
