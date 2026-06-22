export type User={id:string;name:string;email:string;role:string;active?:boolean};
export type Field={id?:string;key:string;label:string;type:number;required:boolean;order:number;optionsJson?:string};
export type Step={id?:string;name:string;description?:string;type:number;order:number;assignedUserId?:string;configurationJson?:string};
export type Flow={id:string;name:string;description:string;entryType:number;active:boolean;fields:Field[];steps:Step[]};
export type Progress={id:string;name:string;order:number;type:number;status:number;startedAt?:string;completedAt?:string};
export type Instance={id:string;flowDefinitionId:string;flowName:string;code:string;status:number;currentStepOrder:number;createdAt:string;updatedAt:string;data:Record<string,unknown>;steps:Progress[]};
