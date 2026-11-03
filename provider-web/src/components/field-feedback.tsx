export function FieldFeedback({name,message}:{name:string;message?:string}){
 return message?<span id={name+'-error'} className="field-error" role="alert">{message}</span>:null
}
export function invalidField(name:string,message?:string){
 return {id:name,'aria-invalid':message?true:undefined,'aria-describedby':message?name+'-error':undefined}
}
