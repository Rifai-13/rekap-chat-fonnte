<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiKnowledge extends Model
{
    protected $table = 'ai_knowledge'; // Sesuaikan dengan nama tabel migrasi
    protected $fillable = ['content', 'source_url'];
}