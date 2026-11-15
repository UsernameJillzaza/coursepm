export type Person = { id: number; name: string }
export type Team = { id: number; name: string; courseCode: string; members: Person[]; supervisors: Person[] }
