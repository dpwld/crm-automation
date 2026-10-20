'use client';
import { Star } from 'lucide-react';
import { Button } from '@/components/ds/core/Button';
export function CompanyFavoriteButton({name,favorite,disabled,onToggle}:{name:string;favorite:boolean;disabled?:boolean;onToggle:()=>void}){
 return <Button variant="ghost" size="sm" iconOnly disabled={disabled} aria-pressed={favorite} aria-label={`${favorite?'Remove':'Add'} ${name} ${favorite?'from':'to'} favorites`} title={favorite?'Remove from favorites':'Add to favorites'} onClick={e=>{e.stopPropagation();onToggle();}}><Star size={15} fill={favorite?'currentColor':'none'} style={{color:favorite?'var(--color-warning,#c48600)':'var(--text-subtle)'}}/></Button>;
}
