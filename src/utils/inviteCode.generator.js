import prisma from "../prismaClient.js";
const characters ='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const generateInviteCode=(length)=>{
    let result='';
    const charactersLength=characters.length;
    for ( let i = 0; i < length; i++ ) {
        result+=characters.charAt(Math.floor(Math.random()*charactersLength));
    }
    return result;
}