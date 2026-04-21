<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiKnowledge extends Model
{
    protected $table = 'ai_knowledge';
    protected $fillable = ['content', 'source_url'];
}